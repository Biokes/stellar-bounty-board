import "dotenv/config";
import cors from "cors";
import express, { Request, Response } from "express";
import {
  createBounty,
  listBounties,
  refundBounty,
  releaseBounty,
  reserveBounty,
  submitBounty,
} from "./services/bountyStore";
import { listOpenIssues } from "./services/openIssues";
import {
  bountyIdSchema,
  createBountySchema,
  maintainerActionSchema,
  reserveBountySchema,
  submitBountySchema,
  zodErrorMessage,
} from "./validation/schemas";
import { limiter } from "./utils";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

function parseId(raw: string | string[] | undefined): string {
  return bountyIdSchema.parse(Array.isArray(raw) ? raw[0] : raw);
}

function sendError(res: Response, error: unknown, statusCode = 400) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(statusCode).json({ error: message });
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    service: "stellar-bounty-board-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * UPDATED: Added Pagination support
 * Acceptance Criteria: Filters (if added later) must be applied before slicing.
 */
app.get("/api/bounties", (req: Request, res: Response) => {
  try {
    const allBounties = listBounties(); // Fetches from backend/data/bounties.json

    // 1. Extract and validate pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));

    // 2. Logic for slicing
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = allBounties.slice(startIndex, endIndex);

    // 3. Return structured response with metadata
    res.json({
      data: paginatedData,
      meta: {
        totalCount: allBounties.length,
        currentPage: page,
        totalPages: Math.ceil(allBounties.length / limit),
        hasMore: endIndex < allBounties.length,
        pageSize: limit
      }
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/bounties", limiter, (req: Request, res: Response) => {
  const parsed = createBountySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodErrorMessage(parsed.error) });
    return;
  }

  try {
    const bounty = createBounty(parsed.data);
    res.status(201).json({ data: bounty });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/bounties/:id/reserve", limiter, (req: Request, res: Response) => {
  const parsedBody = reserveBountySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: zodErrorMessage(parsedBody.error) });
    return;
  }

  try {
    const bounty = reserveBounty(parseId(req.params.id), parsedBody.data.contributor);
    res.json({ data: bounty });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/bounties/:id/submit", limiter, (req: Request, res: Response) => {
  const parsedBody = submitBountySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: zodErrorMessage(parsedBody.error) });
    return;
  }

  try {
    const bounty = submitBounty(
      parseId(req.params.id),
      parsedBody.data.contributor,
      parsedBody.data.submissionUrl,
      parsedBody.data.notes,
    );
    res.json({ data: bounty });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/bounties/:id/release", limiter, (req: Request, res: Response) => {
  const parsedBody = maintainerActionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: zodErrorMessage(parsedBody.error) });
    return;
  }

  try {
    const bounty = releaseBounty(parseId(req.params.id), parsedBody.data.maintainer);
    res.json({ data: bounty });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/bounties/:id/refund", limiter, (req: Request, res: Response) => {
  const parsedBody = maintainerActionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: zodErrorMessage(parsedBody.error) });
    return;
  }

  try {
    const bounty = refundBounty(parseId(req.params.id), parsedBody.data.maintainer);
    res.json({ data: bounty });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/open-issues", (_req: Request, res: Response) => {
  res.json({ data: listOpenIssues() });
});

app.listen(port, () => {
  console.log(`Stellar Bounty Board API listening on http://localhost:${port}`);
});
