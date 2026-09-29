/**
 * Optional Amazon Bedrock speech. Local speak.js is the default.
 * Set BEDROCK_MODEL_ID (e.g. amazon.nova-micro-v1:0) and AWS_REGION.
 * Never send patient name, medicine, or diagnosis to the model.
 */
export async function speakWithBedrock(row, fallback) {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId || !row) return fallback;

  let BedrockRuntimeClient, ConverseCommand;
  try {
    ({ BedrockRuntimeClient, ConverseCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    ));
  } catch {
    return fallback;
  }

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
  });

  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: "user",
        content: [
          {
            text:
              "One spoken sentence. Fields only: " +
              `id ${row.id}, status ${row.status}, owner ${row.owner}, due ${row.due}. ` +
              "Do not add a patient name or a medicine.",
          },
        ],
      },
    ],
    inferenceConfig: { maxTokens: 80, temperature: 0 },
  });

  try {
    const out = await client.send(command);
    const text = out?.output?.message?.content?.[0]?.text;
    return String(text || fallback).slice(0, 240);
  } catch {
    return fallback;
  }
}

export function awsEnabled() {
  return Boolean(process.env.BEDROCK_MODEL_ID);
}
