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

function isIpv6(ip: string): boolean {
  // Basic IPv6 validation
  // Supports full form, compressed form (::), and mixed IPv4 notation
  const parts = ip.split(':')
  
  // IPv6 can have 3-8 parts (due to :: compression)
  if (parts.length < 3 || parts.length > 8) return false
  
  // Check for :: (can only appear once)
  const emptyParts = parts.filter(p => p === '')
  if (emptyParts.length > 1) {
    // Multiple consecutive empty parts is only valid with ::
    const doubleColonMatch = ip.match(/::/g)
    if (!doubleColonMatch || doubleColonMatch.length > 1) return false
  }
  
  // Validate each part
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    
    // Empty part is valid only for :: compression
    if (part === '') {
      // Empty part must be at start, end, or part of ::
      if (i !== 0 && i !== parts.length - 1) {
        // Check if it's part of ::
        if (i === 0 || parts[i - 1] !== '' && parts[i + 1] !== '') {
          continue
        }
      }
      continue
    }
    
    // Check for IPv4 suffix (e.g., ::ffff:192.0.2.1)
    if (part.includes('.')) {
      // This should be the last part and be a valid IPv4
      if (i !== parts.length - 1) return false
      if (!isIpv4(part)) return false
      continue
    }
    
    // Each hex part should be 1-4 hex digits
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false
  }
  
  return true
}

function isValidIpv6Cidr(cidr: string): boolean {
  const [ip, mask] = cidr.split('/')
  if (!ip || mask === undefined) return false
  if (!isIpv6(ip)) return false
  if (!/^\d{1,3}$/.test(mask)) return false
  const m = Number(mask)
  return m >= 0 && m <= 128
}

function isValidIpCidr(cidr: string): boolean {
  return isValidIpv4Cidr(cidr) || isValidIpv6Cidr(cidr)
}

async function resolveAllowedIpCidr(): Promise<string> {
  const ipCidrEnv = (process.env.ALLOWED_IP_CIDR || '').trim()
  const ipEnv = (process.env.ALLOWED_IP || '').trim()

  if (ipCidrEnv) {
    // Check if it's a valid IPv4 or IPv6 CIDR
    if (isValidIpCidr(ipCidrEnv)) {
      return ipCidrEnv
    }
    throw new Error(
      `ALLOWED_IP_CIDR must be a valid IPv4 CIDR (e.g., "203.0.113.7/32") or IPv6 CIDR (e.g., "2001:db8::1/128"). Got: ${ipCidrEnv}`
    )
  }

  if (ipEnv) {
    // If ALLOWED_IP contains a slash, treat it as a CIDR
    if (ipEnv.includes('/')) {
      if (isValidIpCidr(ipEnv)) {
        return ipEnv
      }
      throw new Error(
        `ALLOWED_IP appears to be a CIDR but is invalid. Provide a valid IPv4 CIDR (e.g., "203.0.113.7/32") or IPv6 CIDR (e.g., "2001:db8::1/128"). Got: ${ipEnv}`
      )
    }

    // Bare IP without mask - normalize to /32 for IPv4 or /128 for IPv6
    if (isIpv4(ipEnv)) {
      return `${ipEnv}/32`
    }
    if (isIpv6(ipEnv)) {
      return `${ipEnv}/128`
    }
    
    throw new Error(
      `ALLOWED_IP must be a valid IPv4 or IPv6 address. Got: ${ipEnv}`
    )
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
