import {Construct} from 'constructs';
import {
  CfnDelivery,
  CfnDeliveryDestination,
  CfnDeliverySource,
  LogGroup,
} from "aws-cdk-lib/aws-logs";
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import {Names} from "aws-cdk-lib";

export interface CloudFrontLogToCloudWatchProps {
  distribution: cloudfront.IDistribution;
  outputFormat: 'json' | 'w3c' | 'raw' | 'plain'
}

// https://github.com/aws/aws-cdk/issues/32279#issuecomment-3176394090
export class CloudFrontLogToCloudWatch extends Construct {
  public readonly logGroup: LogGroup;
  constructor(scope: Construct, id: string, props: CloudFrontLogToCloudWatchProps) {
    super(scope, id);

    const distDeliverySource = new CfnDeliverySource(this, "DistributionDeliverySource", {
      name: `${Names.uniqueResourceName(this, {maxLength:55})}-src`,
      logType: 'ACCESS_LOGS',
      resourceArn: props.distribution.distributionArn
    });

    this.logGroup = new LogGroup(this, 'DistributionLogGroup', {})

    const distDeliveryDestination = new CfnDeliveryDestination(this, "DistributionDeliveryDestination", {
      name: `${Names.uniqueResourceName(this, {maxLength:55})}-dest`,
      destinationResourceArn: this.logGroup.logGroupArn,
      outputFormat: props.outputFormat
    });

    const delivery = new CfnDelivery(this, "DistributionDelivery", {
      deliverySourceName: distDeliverySource.name,
      deliveryDestinationArn: distDeliveryDestination.attrArn
    });
    delivery.node.addDependency(distDeliverySource);
    delivery.node.addDependency(distDeliveryDestination);
  }
}
