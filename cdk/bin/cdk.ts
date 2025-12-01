#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { WebAppStack } from '../lib/web-app-stack'

function isIpv4(ip: string): boolean {
  // Basic IPv4 validation (0-255 for each octet)
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = Number(p)
    return n >= 0 && n <= 255
  })
}

function isValidIpv4Cidr(cidr: string): boolean {
  const [ip, mask] = cidr.split('/')
  if (!ip || mask === undefined) return false
  if (!isIpv4(ip)) return false
  if (!/^\d{1,2}$/.test(mask)) return false
  const m = Number(mask)
  return m >= 0 && m <= 32
}

async function resolveAllowedIpCidr(): Promise<string> {
  const ipCidrEnv = (process.env.ALLOWED_IP_CIDR || '').trim()
  const ipEnv = (process.env.ALLOWED_IP || '').trim()

  if (ipCidrEnv) {
    if (!isValidIpv4Cidr(ipCidrEnv)) {
      throw new Error(
        `ALLOWED_IP_CIDR must be a valid IPv4 CIDR like "203.0.113.7/32". Got: ${ipCidrEnv}`
      )
    }
    return ipCidrEnv
  }

  if (ipEnv) {
    // If ALLOWED_IP is a bare IPv4 without mask, normalize to /32
    if (ipEnv.includes('/')) {
      if (!isValidIpv4Cidr(ipEnv)) {
        throw new Error(
          `ALLOWED_IP appears to be a CIDR but is invalid. Provide IPv4 like "203.0.113.7/32".`
        )
      }
      return ipEnv
    }

    if (!isIpv4(ipEnv)) {
      throw new Error(
        `ALLOWED_IP must be an IPv4 address (this stack currently supports IPv4 WAF only). Got: ${ipEnv}`
      )
    }
    return `${ipEnv}/32`
  }

  // Do not prompt interactively; fail fast with a clear error if no env var is set.
  throw new Error('ALLOWED_IP_CIDR (or ALLOWED_IP) environment variable must be set to deploy the stack.')
}

async function main() {
  const app = new App()

  const allowedIpCidr = await resolveAllowedIpCidr()

  new WebAppStack(app, 'SimpleFormWebAppStack', {
    description: 'S3 + CloudFront hosted React app with API Gateway (/api) backed by Lambda (ice cream picker)',
    allowedIpCidr,
    env: {
      region: 'us-east-1',
    }
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
