/**
 * Gửi tin nhắn reply qua Facebook Graph API.
 */
export async function sendMessengerMessage(
  recipientId: string,
  text: string,
  pageAccessToken: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("https://graph.facebook.com/v19.0/me/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const data = (await res.json()) as { error?: { message: string } };
  if (!res.ok) {
    console.error("[messenger/send-message]", data);
    return { success: false, error: data.error?.message ?? "Gửi tin nhắn thất bại" };
  }
  return { success: true };
}
