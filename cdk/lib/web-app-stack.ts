import {CfnOutput, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib'
import {Construct} from 'constructs'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import {AllowedMethods} from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import {CloudFrontLogToCloudWatch} from './cloudfront-log-to-cloudwatch'

export interface WebAppStackProps extends StackProps {
  /**
   * Single IPv4 or IPv6 CIDR (e.g. `203.0.113.4/32` or `2001:db8::1/128`) that is allowed to access the app via CloudFront.
   */
  readonly allowedIpCidr: string
}

export class WebAppStack extends Stack {
  private readonly allowedIpCidr: string

  constructor(scope: Construct, id: string, props: WebAppStackProps) {
    super(scope, id, props)

    if (!props.allowedIpCidr || props.allowedIpCidr.trim().length === 0) {
      throw new Error('WebAppStack requires `allowedIpCidr` to be provided (e.g. "203.0.113.4/32").')
    }

    this.allowedIpCidr = props.allowedIpCidr.trim()

    // S3 bucket to store the frontend
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Legacy Origin Access Identity (simple and widely supported)
    const oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI')

    const s3Origin = origins.S3BucketOrigin.withOriginAccessIdentity(siteBucket, {originAccessIdentity: oai})

    // Allow CloudFront OAI to read from the bucket
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [oai.grantPrincipal]
    }))

    // Lambda (Node.js, bundled via esbuild)
    const handler = new lambdaNode.NodejsFunction(this, 'SubmitFunction', {
      entry: `${__dirname}/../../../lambda/src/handler.ts`,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(5),
      bundling: {minify: true, target: 'node20'},
    })

    // API Gateway REST API with /submit
    const api = new apigw.RestApi(this, 'SubmitApi', {
      restApiName: 'IceCreamSubmitApi',
      deployOptions: {stageName: 'prod'},
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['OPTIONS', 'POST'],
        allowHeaders: ['Content-Type'],
      },
    })

    const apiRoot = api.root.addResource('api')
    const submit = apiRoot.addResource('survey')
    submit.addMethod('POST', new apigw.LambdaIntegration(handler))


    const waf = this.createWaf()

    // CloudFront -> S3 (default) and -> API for /api/*
    const apiDomain = `${api.restApiId}.execute-api.${this.region}.amazonaws.com`
    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      originPath: `/${api.deploymentStage.stageName}`,
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    })

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      webAclId: waf.attrArn,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        ['/api/*']: {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_CUSTOM_ORIGIN,
          allowedMethods: AllowedMethods.ALLOW_ALL
        },
      },
      errorResponses: [
        {httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1)},
      ],
    })

    new CloudFrontLogToCloudWatch(this, 'LogDelivery', {
      distribution,
      outputFormat: 'json',
    })

    // Deploy frontend to S3
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset(`${__dirname}/../../../frontend/dist`)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    })

    new CfnOutput(this, 'CloudFrontURL', {value: `https://${distribution.distributionDomainName}`})
    new CfnOutput(this, 'ApiInvokeUrl', {value: api.urlForPath('/survey')})
  }

  private getIpAddressVersion(cidr: string): 'IPV4' | 'IPV6' {
    // Determine if the CIDR is IPv4 or IPv6 based on the presence of colons
    return cidr.includes(':') ? 'IPV6' : 'IPV4'
  }

  private createWaf() {
    const ipAddressVersion = this.getIpAddressVersion(this.allowedIpCidr)

    const ipSet = new wafv2.CfnIPSet(this, `CloudFrontIpWhitelist-${ipAddressVersion}`, {
      addresses: [
        this.allowedIpCidr,
      ],
      ipAddressVersion,
      scope: 'CLOUDFRONT',
      name: 'CloudFrontIpWhitelist',
    })

    const waf = new wafv2.CfnWebACL(this, 'CloudFrontWebAcl', {
      defaultAction: {block: {}},
      scope: 'CLOUDFRONT',
      name: 'CloudFrontIpWhitelistAcl',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'CloudFrontWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'IpAllowListRule',
          priority: 0,
          action: {allow: {}},
          statement: {
            ipSetReferenceStatement: {
              arn: ipSet.attrArn,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IpAllowListRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    })
    this.addWafLogging(waf)
    return waf
  }

  private addWafLogging(webAcl: wafv2.CfnWebACL) {
    const name = `aws-waf-logs-${webAcl.name}`
    const wafLogGroup = new logs.LogGroup(this, name, {
      logGroupName: name,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    new wafv2.CfnLoggingConfiguration(this, `${name}-config`, {
      logDestinationConfigs: [wafLogGroup.logGroupArn],
      resourceArn: webAcl.attrArn
    })
  }
}
