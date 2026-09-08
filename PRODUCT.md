# Product

## Register

brand

## Users

The project author is a production web developer learning AWS for the first time. They need a clear, self-contained reference they can study before a 30-minute university Q&A.

## Product Purpose

Explain the Kallo Analytics AWS architecture accurately enough that the author can understand and defend every service choice, configuration constraint, tradeoff, and demo flow.

## Brand Personality

Calm, precise, candid. The writing should feel like a senior engineer explaining a real system at a whiteboard, including where choices were made for learning or rubric coverage.

## Anti-references

Avoid AWS marketing language, generic cloud diagrams, unexplained acronyms, decorative dashboard styling, and claims not supported by the repository.

## Design Principles

- Ground every explanation in this project's deployed resources.
- Translate cloud concepts into familiar programming and server equivalents.
- Make tradeoffs and Learner Lab constraints easy to recall under questioning.
- Prefer scan-friendly reference structure without flattening important nuance.
- Be honest about pedagogical choices and operational limitations.

## Current Product Boundary

- Domain analytics are daily/manual Glue aggregates, not near-real-time telemetry.
- System telemetry is read from Google Cloud Monitoring and cached briefly in DynamoDB.
- Exact AI-meal traces are bounded Supabase RPC reads performed by the Next.js server.
- Athena and the generated Gemini weekly-summary feature are intentionally omitted because they did not add enough operator value.
- Vercel provides the permanent link; ALB + ECS Fargate remains the disposable AWS assessment path.

## Accessibility & Inclusion

Use semantic HTML, strong contrast, visible focus states, descriptive image alternatives, readable line lengths, responsive tables, and no motion-dependent meaning.
