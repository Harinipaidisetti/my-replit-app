import { Router, type IRouter } from "express";
import {
  CreateChatCompletionBody,
  CreateChatCompletionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const NOVAAI_SYSTEM_PROMPT = `You are NovaAI, a helpful, friendly, knowledgeable AI assistant for students.
Answer clearly and help users learn. Explain difficult ideas in beginner-friendly language, help with programming, brainstorming, writing, and study planning. Ask a clarifying question when needed. Keep answers focused, use headings and lists for complex topics, and be honest when uncertain.`;

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-5-mini";
const MAX_TOTAL_MESSAGE_CHARACTERS = 80_000;

router.post("/chat/completions", async (req, res): Promise<void> => {
  const parsed = CreateChatCompletionBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn(
      { issueCount: parsed.error.issues.length },
      "Invalid NovaAI chat request",
    );
    res.status(400).json({ error: "Please enter a valid message and try again." });
    return;
  }

  const { messages } = parsed.data;
  const lastMessage = messages[messages.length - 1];
  const totalCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  if (lastMessage?.role !== "user" || totalCharacters > MAX_TOTAL_MESSAGE_CHARACTERS) {
    res.status(400).json({
      error: "This conversation is too long to send. Start a new chat and try again.",
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    req.log.error("OPENAI_API_KEY is missing; AI replies are unavailable");
    res.status(503).json({
      error: "AI responses aren't connected yet. Add an OpenAI API key in Replit Secrets to enable NovaAI.",
    });
    return;
  }

  try {
    const providerResponse = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: 8192,
        messages: [
          { role: "system", content: NOVAAI_SYSTEM_PROMPT },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!providerResponse.ok) {
      req.log.error(
        { providerStatus: providerResponse.status },
        "OpenAI chat request failed",
      );
      res.status(502).json({
        error: "Sorry, NovaAI couldn't process that request right now. Please try again.",
      });
      return;
    }

    const providerData = (await providerResponse.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = providerData.choices?.[0]?.message?.content?.trim();

    if (!content) {
      req.log.error("OpenAI returned an empty chat response");
      res.status(502).json({
        error: "Sorry, NovaAI couldn't process that request right now. Please try again.",
      });
      return;
    }

    res.json(CreateChatCompletionResponse.parse({ content }));
  } catch (error) {
    req.log.error({ err: error }, "OpenAI chat request could not be completed");
    res.status(502).json({
      error: "Sorry, NovaAI couldn't process that request right now. Please try again.",
    });
  }
});

export default router;