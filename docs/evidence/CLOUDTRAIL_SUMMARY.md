# CloudTrail summary: activity of the coding agent's IAM user

Generated on 2026-10-01 with:

```bash
aws cloudtrail lookup-events --region us-east-1 \
  --lookup-attributes AttributeKey=Username,AttributeValue=vitrina-agent --max-items 5000
```

The coding agent (Claude Code, connected to the AWS MCP Server) works as the limited IAM user `vitrina-agent`, never as root. The query returns the most recent 5,000 events of that user (newest first, so the window starts on 2026-09-30 and the project's earlier events are not counted here); the screenshots in the Builder Center post show the live console view.

| Window of the 5,000 events | 2026-09-30 12:39 to 2026-10-01 00:51 (Lima time) |
| --- | --- |

## Events by AWS service

| Service | Events |
| --- | ---: |
| Amazon S3 | 1283 |
| AWS Lambda | 894 |
| AWS IAM | 807 |
| Amazon DynamoDB | 797 |
| AWS KMS | 624 |
| AWS CloudFormation | 225 |
| Amazon CloudFront | 137 |
| Amazon Bedrock | 104 |
| AWS Step Functions | 46 |
| Sign-in (`aws login` token refresh) | 26 |
| AWS STS | 20 |
| Amazon SageMaker, CloudWatch Logs, CloudTrail | 8, 8, 7 |

## Selected calls that change state or run workloads

| Calls | Event |
| ---: | --- |
| 103 | `bedrock:InvokeModel` (Titan embeddings for the fidelity check) |
| 50 | `lambda:UpdateFunctionCode` |
| 30 | `lambda:UpdateFunctionConfiguration` |
| 13 + 13 | `cloudformation:CreateChangeSet` and `ExecuteChangeSet` (every deploy is previewed as a change set, then executed) |
| 5 | `cloudfront:CreateInvalidation` |
| 2 | `states:StartExecution` |
| 1 | `states:CreateStateMachine`, `states:UpdateStateMachine`, `cloudfront:UpdateDistribution` |

## Direct check through the AWS MCP Server

On 2026-10-01 a read-only script was executed through the AWS MCP Server tool (`aws___run_script`, boto3 calls `sts:GetCallerIdentity` and `cloudformation:DescribeStacks`). It returned the identity `arn:aws:iam::<account>:user/vitrina-agent` and the stack `vitrina` with status `UPDATE_COMPLETE`.

See `docs/BUILD_LOG.md` for each AWS-changing step with its date, request and resources.
