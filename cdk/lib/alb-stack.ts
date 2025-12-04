import {CfnOutput, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib'
import {Construct} from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import * as logs from 'aws-cdk-lib/aws-logs'
import {IpSet} from './ip-set-construct'

export interface AlbStackProps extends StackProps {
  /**
   * Single IPv4 or IPv6 CIDR (e.g. `203.0.113.4/32` or `2001:db8::1/128`) that is allowed to access the ALB via WAF.
   */
  readonly allowedIpCidr: string
}

export class AlbStack extends Stack {
  private readonly allowedIpCidr: string

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props)

    if (!props.allowedIpCidr || props.allowedIpCidr.trim().length === 0) {
      throw new Error('AlbStack requires `allowedIpCidr` to be provided (e.g. "203.0.113.4/32").')
    }

    this.allowedIpCidr = props.allowedIpCidr.trim()

    // Create VPC
    const vpc = new ec2.Vpc(this, 'AlbVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      deletionProtection: false,
    })

    // Create WAF
    const waf = this.createWaf()

    // Associate WAF with ALB
    new wafv2.CfnWebACLAssociation(this, 'AlbWafAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: waf.attrArn,
    })

    // Add listener with default fixed response
    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'Hello from Application Load Balancer!',
      }),
    })

    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'DNS name of the Application Load Balancer',
    })

    new CfnOutput(this, 'AlbUrl', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'URL of the Application Load Balancer',
    })
  }

  private createWaf() {
    const ipSet = new IpSet(this, 'AlbIpWhitelist', {
      name: 'AlbIpWhitelist',
      allowedIpCidr: this.allowedIpCidr,
      cloudfront: false,
    })

    const waf = new wafv2.CfnWebACL(this, 'AlbWebAcl', {
      defaultAction: {block: {}},
      scope: 'REGIONAL',
      name: 'AlbIpWhitelistAcl',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'AlbWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'IpAllowListRule',
          priority: 0,
          action: {allow: {}},
          statement: {
            ipSetReferenceStatement: {
              arn: ipSet.ipSet.attrArn,
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
