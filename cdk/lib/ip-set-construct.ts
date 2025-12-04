import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import {Construct} from 'constructs'

export interface IpSetProps {
  name: string
  allowedIpCidr: string
  cloudfront: boolean
}

export class IpSet extends Construct {
  public readonly ipSet: wafv2.CfnIPSet

  constructor(scope: Construct, id: string, props: IpSetProps) {
    super(scope, id)
    const {allowedIpCidr, cloudfront, name} = props

    const ipAddressVersion = this.getIpAddressVersion(allowedIpCidr)

    this.ipSet = new wafv2.CfnIPSet(this, `${name}-IpSet-${ipAddressVersion}`, {
      addresses: [
        allowedIpCidr
      ],
      ipAddressVersion,
      scope: cloudfront ? 'CLOUDFRONT' : 'REGIONAL',
      name: `${name}-IpSet-${ipAddressVersion}`,
    })
  }

  private getIpAddressVersion(cidr: string): 'IPV4' | 'IPV6' {
    // Determine if the CIDR is IPv4 or IPv6 based on the presence of colons
    return cidr.includes(':') ? 'IPV6' : 'IPV4'
  }
}

