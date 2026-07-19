/** FinMind API v4 認證（token 需放在 Authorization header） */
export function getFinMindToken(): string | undefined {
  const token = process.env.FINMIND_TOKEN?.trim();
  return token || undefined;
}

export function finMindAuthHeaders(): HeadersInit {
  const token = getFinMindToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export const FINMIND_HOLDING_NEEDS_BACKER_MSG =
  "股權分散表（TaiwanStockHoldingSharesPer）需 FinMind Backer 以上會員，並在 .env 設定 FINMIND_TOKEN。";
