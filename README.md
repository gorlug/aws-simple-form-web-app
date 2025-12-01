## AWS Simple Form Web App

This repository contains a small, end‑to‑end sample application designed to demonstrate a basic, but production‑style, web setup on AWS:

- A simple static **frontend** (served from Amazon S3)
- A minimal **backend** (AWS Lambda behind Amazon API Gateway)
- A **CloudFront** distribution in front of both frontend and backend
- A **Web Application Firewall (AWS WAF)** with an **IP allow‑list** that restricts access

The goal is to show how you can stitch together these pieces in a clean, infrastructure‑as‑code way using the AWS CDK.

### High‑level Architecture

1. **Frontend (S3 + CloudFront)**
   - A static single‑page application is built (see the `frontend` directory) and deployed to an S3 bucket.
   - Public access to the bucket is fully blocked; CloudFront uses an Origin Access Identity (OAI) to read the files.
   - CloudFront serves the SPA, with the default root object set to `index.html`.

2. **Backend (API Gateway + Lambda)**
   - A small Node.js Lambda function (see the `lambda` directory) implements the backend logic — for example, handling a simple form submission.
   - Amazon API Gateway exposes the Lambda via a REST endpoint (e.g. `/api/survey`).
   - CloudFront is configured with an additional behavior that forwards `/api/*` requests to API Gateway.

3. **Edge Security (CloudFront + AWS WAF + IP allow‑list)**
   - An AWS WAF Web ACL is associated with the CloudFront distribution.
   - The Web ACL uses an **IP set** that contains the allowed client IPs.
   - The **default action is to block** all traffic; only requests from IPs in the allow‑list are permitted.
   - This effectively puts the entire app (frontend and backend) behind an IP whitelist.

4. **Infrastructure as Code (CDK)**
   - The infrastructure is provisioned via AWS CDK (see the `cdk` directory).
   - The `WebAppStack` sets up the S3 bucket, CloudFront distribution, API Gateway, Lambda function, WAF IP set, and WAF Web ACL.

### What This Project Is (and Isn’t)

**This IS:**

- A **sample project** meant for learning and demonstration.
- A concise reference for:
  - Hosting a static SPA on S3 behind CloudFront
  - Wiring CloudFront to an API Gateway + Lambda backend
  - Protecting the whole app with AWS WAF using an IP allow‑list

**This is NOT:**

- A full‑featured production application.
- A security hardening guide. The WAF configuration is intentionally simple and focuses only on IP whitelisting.

### Repository Layout (Overview)

- `frontend/` – Source for the simple frontend (built and deployed to S3).
- `lambda/` – Source for the backend Lambda function.
- `cdk/` – AWS CDK app that defines and deploys the infrastructure (S3, CloudFront, API Gateway, Lambda, WAF, etc.).
- `api-test/` – Optional utilities or scripts for testing the API (if present).

### Deployment (High‑Level)

In this form the whole stack needs to be deployed on us-east-1 so that the WAF can be added to Cloudfront as well as the Logging of Cloudfront to CloudWatch.

The exact commands may vary depending on your environment, but at a high level the flow is:

1. **Install dependencies** at the root and in relevant sub‑projects (`frontend`, `lambda`, `cdk`).
2. **Set your IP allow‑list via environment variable** (required, see details below).
3. **Deploy the stack** from the root run `npm run deploy`.
3. After deployment, CDK outputs:
   - The **CloudFront URL** for accessing the app
   - The **API invoke URL** for calling the backend directly

Remember that only IPs in the configured allow‑list will be able to access the app through CloudFront.

### WAF IP Allow‑List

- The Web ACL is created with a dedicated IP set that contains the allowed IPv4 addresses.
- All requests are blocked by default; a single rule (`IpAllowListRule`) allows only traffic from the configured IPs.
- To use this in your own environment, adjust the IP addresses in the CDK stack to match your needs.

#### Configure the allowed IP via environment variable (required)

The CDK bootstrap script requires you to provide the IP/CIDR to allow through the WAF via an environment variable. If this is not set, deployment will fail.

You can use either of these variables (both are supported; `ALLOWED_IP_CIDR` is preferred):

- `ALLOWED_IP_CIDR` — an explicit IPv4 CIDR string, e.g. `203.0.113.7/32`.
- `ALLOWED_IP` — a plain IPv4 address without mask; the CDK will automatically normalize it to `/32` (single host). If you include a mask (e.g. `203.0.113.0/24`) it will be used as provided. Prefer `ALLOWED_IP_CIDR` so you control the mask explicitly.

Examples to set your current public IPv4 address as a single‑host CIDR and deploy:

- macOS/Linux (bash/zsh):
  ```bash
  export ALLOWED_IP_CIDR="$(curl -s https://checkip.amazonaws.com)/32"
  npm run deploy
  ```

- Windows PowerShell:
  ```powershell
  $env:ALLOWED_IP_CIDR = (Invoke-RestMethod https://checkip.amazonaws.com).Trim() + "/32"
  npm run deploy
  ```

Alternatively, using `ALLOWED_IP` (automatic `/32`):

- macOS/Linux (bash/zsh):
  ```bash
  export ALLOWED_IP="$(curl -s https://checkip.amazonaws.com)"
  npm run deploy
  ```

- Windows PowerShell:
  ```powershell
  $env:ALLOWED_IP = (Invoke-RestMethod https://checkip.amazonaws.com).Trim()
  npm run deploy
  ```

Notes:

- This stack currently supports IPv4 only for the WAF IP set.
- You can supply a broader IPv4 CIDR if needed (e.g. `203.0.113.0/24`), but keep the list as tight as possible.
- For CI/non‑interactive deploys, setting one of the env vars is the only step needed; the CDK app reads it directly.

---

This README is intentionally high‑level. For implementation details, inspect the `WebAppStack` in `cdk/lib/web-app-stack.ts` and the code under `frontend/` and `lambda/`.
