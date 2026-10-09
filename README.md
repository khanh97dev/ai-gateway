# ai-gateway

Công cụ nhỏ để thử nghiệm API các dịch vụ AI (OpenRouter, Gemini...) qua một chỗ.

## Thành phần

- **`server.mjs`** — web app "AI Token Tester" (http://localhost:8787). Test trạng thái từng key và chat thử, chọn model. Key nằm ở server, không lộ ra trình duyệt.
- **`gateway.mjs`** — multi-agent gateway chạy trên OpenRouter: planner → workers (song song) → synthesizer.

## Cài & chạy

Cần [Node.js](https://nodejs.org) (>=18).

```bash
# 1. tạo keys.json từ mẫu rồi điền key thật
cp keys.example.json keys.json

# 2. web tester
node server.mjs            # -> http://localhost:8787

# 3. multi-agent gateway
OPENROUTER_API_KEY=sk-or-... node gateway.mjs "task của bạn"
```

## keys.json

```json
{
  "openrouter": "sk-or-v1-...",
  "gemini": "AIzaSy...",
  "xai": "xai-..."
}
```

> `keys.json` nằm trong `.gitignore` — KHÔNG commit key lên repo. Lấy key free tại
> [openrouter.ai](https://openrouter.ai) (có nhiều model `:free`).

## Ghi chú

- OpenRouter: free tier, nhiều model `:free`, 1 key dùng được hàng trăm model.
- Gemini: key tạo từ AI Studio bị khóa restriction, chỉ chạy trong AI Studio (không gọi backend được) trừ khi gỡ trong Cloud Console.
- xAI/Grok: không có free tier, cần nạp credit mới gọi được.

Muốn gateway "xịn" hơn (fallback, load-balance, OpenAI-compatible đầy đủ) thì dùng [LiteLLM](https://github.com/BerriAI/litellm).
