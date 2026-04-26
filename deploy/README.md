# Deploy artifacts

Reference IAM policies for provisioning the MCP server's runtime role on AWS App Runner. Used by `viraly-api/docs/MCP_PROD_DEPLOY_HANDOFF.md` §4.3.

## Files

- **`app-runner-trust-policy.json`** — trust policy for the *instance* role. Lets `tasks.apprunner.amazonaws.com` assume this role at container start time.
- **`iam-role.json`** — inline policy attached to the same instance role. Grants CloudWatch Logs writes (scoped to the MCP server's log groups) and Secrets Manager reads (scoped to the `mcp-server/*` prefix). Nothing else.

## How to apply

```bash
aws iam create-role \
  --role-name AppRunnerInstanceRole-viraly-mcp \
  --assume-role-policy-document file://app-runner-trust-policy.json

aws iam put-role-policy \
  --role-name AppRunnerInstanceRole-viraly-mcp \
  --policy-name MCPServerRuntimePolicy \
  --policy-document file://iam-role.json
```

## Note on the second IAM role you'll need

App Runner also needs an **ECR access role** (`AppRunnerECRAccessRole`) to pull the image from private ECR. AWS provides a managed policy (`AWSAppRunnerServicePolicyForECRAccess`); attach it to a role with the `build.apprunner.amazonaws.com` service-principal trust. The handoff doc has the snippet.
