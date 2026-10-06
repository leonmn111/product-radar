# ProductRadar Architecture & Rules
- Stack: Next.js (App Router), TypeScript, PostgreSQL, Prisma, Zod, Tailwind CSS.
- Rule 1: Build in vertical slices. Do not build the entire project in one step.
- Rule 2: Keep payment logic (x402) strictly isolated from core business logic.
- Rule 3: Evidence-First. Every claim must have an attached source, timestamp, and quality score. Never invent evidence.
- Rule 4: Treat scores as calculated estimates, not guarantees.
