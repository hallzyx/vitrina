<!--
Builder Center post. Paste the body below the line with the editor's Markdown toggle ON.
Title (7 to 255 chars):
  Vitrina: let buyers spin handmade crafts, using only the artisan's real photos
Description (max 512 chars):
  Vitrina turns about 12 phone photos of a handmade piece into a public storefront where buyers rotate it 360 degrees and order on WhatsApp. No generative AI touches the piece: background removal is mask-only and every frame is checked against its original photo. Built on Amazon Bedrock, Step Functions, Lambda, DynamoDB, S3 and CloudFront, with Claude Code and the AWS MCP Server.
Tags (max 5, AWS products): Amazon Bedrock, AWS Step Functions, AWS Lambda, Amazon CloudFront, Amazon DynamoDB
Hackathon hashtags go in the first line of the body: #commercial-potential #startups
GitHub: https://github.com/hallzyx/vitrina
Live demo: https://dz81nhpgrhb93.cloudfront.net
Notebook: leave empty
-->

**AWS Zero to Shipped** · #commercial-potential · #startups

Small artisans sell through chat apps with a handful of flat photos. A buyer cannot turn a piece in their hands, so they hesitate, ask for more pictures, or leave. **Vitrina** fixes that with something an artisan can do with a phone in a few minutes.

**Try it now, no sign-up and no code:** https://dz81nhpgrhb93.cloudfront.net/s/example
Drag any product to spin it. Open `/create` and choose "Try with sample photos" to watch the real pipeline process a photo set live.

## What it does

1. The artisan walks around the piece and takes about 12 photos.
2. A pipeline removes each background, aligns the frames, checks fidelity, suggests a brand and writes the listing in English and Spanish.
3. Buyers get a public storefront with a draggable 360 degree viewer and a WhatsApp button with the order message already written.
4. The artisan manages everything from a secret edit link. No accounts.

## The rule that shapes everything: fidelity

Generative AI never touches how the piece looks. Background removal produces a **mask only**, so the piece's pixels stay exactly as photographed. Each processed frame is then compared with its original photo using **Amazon Titan Multimodal Embeddings**, and frames that drift from reality are discarded. The product states how many frames were actually checked, so a partial check is never passed off as a full one. The listing, written with **Amazon Nova Pro**, is validated in code: invented materials, origin or measurements are rejected, and English and Spanish equivalents count as the same claim. If the artisan types a title, it is used verbatim.

## Architecture

```
Browser -> CloudFront -> S3 (site)  |  API Gateway -> Lambda -> DynamoDB
                                    |  S3 (processed frames)
Photos -> S3 (presigned POST) -> Step Functions:
  validate -> background removal (ONNX mask) -> align -> fidelity (Titan)
           -> brand (Nova) -> listing EN/ES (Nova Pro) -> finalize
```

| Service | Role |
| --- | --- |
| Amazon Bedrock | Titan embeddings for the fidelity check, Nova Pro for brand and listing |
| AWS Step Functions | The seven-step pipeline, per-photo parallelism, retries on throttling |
| AWS Lambda, API Gateway | API and pipeline tasks (Python 3.12, arm64) |
| Amazon S3, CloudFront | Site, private uploads, processed frames |
| Amazon DynamoDB | Stores, products, stats, rate-limit counters |
| SSM Parameter Store, IAM, Budgets | Invite phrase (SecureString), least-privilege roles under a permissions boundary, a USD 20 monthly cap |

The whole stack is one AWS SAM template. There is no NAT gateway, no GPU and no resource with a fixed hourly cost, so it idles near zero.

## A processing screen you can watch

While a product processes, the creator sees a live "workbench": photos lose their background one by one, align into a ring and start to spin, with the real fidelity score of each frame. It is driven only by real outputs of the pipeline.

## Built with a coding agent, and how I kept it honest

I built Vitrina with **Claude Code** connected to the **AWS MCP Server**, working as a limited IAM user (never root). Every AWS-changing step is logged with its date, request, resources and commands in `docs/BUILD_LOG.md`, every decision with its reasons in `docs/DECISIONS.md`, and every deploy went through a reviewed CloudFormation change set. A subagent built the landing page and the processing workbench; the lead agent reviewed, tested and deployed them. 105 automated tests cover validation, limits, security and the pipeline.

## What went wrong, and what I learned

- **Bedrock quotas are real.** Titan on-demand allows 20 requests per minute and cannot be raised. I added backoff, lower concurrency, and scoring every second frame, and the product reports exactly how many frames were checked.
- **Real phone photos behave differently from studio renders.** On 12 photos of a dark bottle, a fixed relative threshold dropped two perfectly good cutouts. I tried re-cutting them (no gain: the same model repeats itself) and then fixed the actual cause, a margin calibrated to each set's own spread. The same photos now keep 12 of 12 frames.
- **A dot in a URL broke the secret edit link.** The CloudFront rewrite treated `/edit/<id>.<secret>` as a file. API-level tests could not see it; I now test direct loads of every route.
- **I dropped 3D.** Image-to-3D needs a GPU or a Marketplace model, and generated geometry would break the fidelity rule. A silhouette-based reconstruction from the real photos worked on studio renders but was not convincing enough, so the real-photo 360 viewer stays the product.

## Honest notes

- The example store and the sample gallery use demo photo sets (credits in `docs/CREDITS.md`). The pipeline running on them is the real one, and I also tested it with real phone photos.
- Creating a store with your own photos is gated by an invite phrase to bound spend; the phrase is provided with the submission.
- Fidelity scores are a coarse detector, not a pixel-exact one.

## Links

- Live app: https://dz81nhpgrhb93.cloudfront.net
- Code: https://github.com/hallzyx/vitrina
- Submission summary for judges: `docs/SUBMISSION.md` in the repository
