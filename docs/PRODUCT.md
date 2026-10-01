# Product: problem, users, solution and market

Category **Commercial Potential** · focus track **Startup**. This document states what is known, what is an estimate and what is still a hypothesis to validate. It contains no market statistics, because none were measured for this project.

## 1. The problem

A handmade piece is a three-dimensional object, but it is sold through flat pictures.

- Small artisans and single-person craft businesses sell mostly through chat apps and social media. A typical listing is a few photos from a few angles, taken in whatever light is available.
- A buyer cannot turn the piece in their hands. They cannot see the back, the base, the handle or how the surface changes with the angle, so they hesitate, ask for more pictures in a private chat, or leave.
- Every extra request costs the seller time they do not have, and an unanswered one is a lost sale.
- The usual fixes do not fit this seller. Professional photography and 3D scanning cost money and skills. General e-commerce builders expect product photos that are already clean and consistent. Generative "enhancement" tools change how the piece looks, which is the one thing a handmade buyer cannot accept.

## 2. Who it is for

Micro-sellers and single-person craft businesses without a marketing team, working from a phone, often selling in Spanish and sometimes to buyers who read English. They already take photos of their work and already take orders on WhatsApp.

A concrete case, taken from our own testing: a seller photographs a dark bottle on a table with a cluttered background using a phone, in uneven light. Twelve photos later the pipeline returns a clean, evenly sized 360 degree spin and a bilingual listing in under a minute, and the seller shares one link.

## 3. The solution

1. **Capture:** about 12 photos walking around the piece.
2. **Processing (about 40 to 60 seconds):** background removal as a mask only, alignment and size normalization, a fidelity check against each original photo, a brand palette and a bilingual listing.
3. **Storefront:** a public page where buyers drag to spin the piece and tap to order on WhatsApp with the message already written.
4. **Management without accounts:** a secret edit link to add products, edit titles, descriptions and prices, and see visits and WhatsApp clicks.

### What Vitrina deliberately does not do

It never generates or "improves" the piece. Frames that drift from the original photo are discarded. The artisan's own title is kept verbatim. The listing cannot claim materials, origin or measurements the artisan did not write. We evaluated an optional 3D model and dropped it for this reason (`docs/DECISIONS.md`).

## 4. Why it is different

| Alternative | Limitation for a craft seller | Vitrina |
| --- | --- | --- |
| Chat app plus loose photos | The buyer asks for more pictures; the seller answers one by one | One link that shows every side |
| Social media posts | Fixed images, no sense of the object, algorithm-dependent reach | A shareable page the seller controls |
| General e-commerce builders | Need clean, consistent product photos and account setup | Works from phone photos with any background, no account |
| 3D scanning or model generation | Hardware, GPU cost or invented geometry that is not the real piece | Real photos only, near-zero marginal cost |
| Generative photo enhancement | Changes how the piece looks | Mask-only processing, fidelity checked per frame |

## 5. Impact

- **Lower barrier:** no equipment, no design skills, no account, no payment integration to set up. A phone and a chat number are enough.
- **Language access:** English and Spanish from the first screen, with the listing produced in both so a local seller can reach buyers who read the other language.
- **Honest representation:** buyers see what they will receive, which protects both sides.
- **Cost to serve (estimate):** processing one product uses a few Titan embeddings and two Nova Pro calls plus short Lambda runs. Our measured usage puts this in the range of cents per product, and the stack has no fixed hourly cost. Billing data lags, so this remains an estimate until the invoices arrive.

## 6. Business model (hypotheses to validate)

- **Free tier:** a small number of products per store, to remove the barrier to try.
- **Paid plan:** more products and stores, custom domain, removal of the Vitrina mark, order and traffic reports. The WhatsApp order flow stays free.
- **Marketplace layer, later:** a directory of stores by craft and region.
- Online payments are out of scope for now: sellers already close sales over chat.

## 7. Go to market (hypotheses to validate)

- Start with sellers who already post their work and take orders by chat, reached through craft fairs, seller communities and social media.
- Every storefront carries a small "made with Vitrina" mark and a "create yours" link, so each shared store brings the next seller.
- Spanish first, with English listings from day one so a seller can reach tourists and remote buyers.

## 8. How success would be measured

| Metric | Why it matters |
| --- | --- |
| Share of started products that reach a published store | The pipeline and the capture guidance work for real phones |
| Frames kept per product and the fidelity score | Quality without invention |
| Visits per store and WhatsApp clicks per visit | Buyers use the spin and it leads to an order |
| Time from first photo to shared link | The promise of "minutes, not days" |
| Cost per processed product | Unit economics |

## 9. Roadmap

- Guided capture that tells the seller which angles are missing, with a quick re-shoot of only those photos.
- Editing the order of frames and a hero photo.
- Store themes and a custom domain.
- Order tracking and basic analytics in the dashboard.
- More languages for the interface and the listing.

## 10. Risks and how they are handled

| Risk | Handling |
| --- | --- |
| Poor or uneven photos | Validation of sharpness and size; a fidelity margin calibrated to each set; clear error messages that say what to retake |
| Model quotas and throttling | Backoff and retries, per-run concurrency limits, scoring every second frame and reporting exactly how many were checked |
| Cost abuse | Invite phrase for live generation, daily per-visitor and global caps, budget alarm |
| Trust in the result | Honest labeling of demos and replays; no generated pixels; limitations documented |
| Dependence on one AI provider family | Model identifiers are configuration, not code |

## 11. What is not claimed

No market size, growth rate or adoption figure is claimed here. The strengths we can show are the working product, its documented measurements (`docs/DECISIONS.md`, `docs/BUILD_LOG.md`) and the reasoning above.
