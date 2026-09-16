// Cloudflare Worker: 주영봇 지시 처리 백엔드
//
// 배포 방법 (Cloudflare 대시보드):
// 1. https://dash.cloudflare.com 가입/로그인
// 2. Workers & Pages → Create → Create Worker
// 3. 편집기에 이 파일 내용을 그대로 붙여넣고 Deploy
// 4. Worker의 Settings → Variables and Secrets → Add
//    이름: ANTHROPIC_API_KEY, 값: console.anthropic.com에서 발급받은 키 (Secret으로 저장)
// 5. 배포된 Worker 주소(https://xxxx.xxxx.workers.dev)를
//    가상 사무실 미니홈피의 "지시하기" 탭 ⚙ 실제 AI 연동 설정에 붙여넣기

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    const cmd = (body.cmd || "").toString().slice(0, 1000).trim();
    if (!cmd) {
      return new Response(JSON.stringify({ error: "empty command" }), {
        status: 400,
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    const system = `너는 가상 사무실의 팀장 주영봇이다. 대표님의 지시를 받으면
1) 어떤 담당 봇에게 배분할지 정한다: 효진봇(일정 조율·진행 점검), 수민봇(자료 조사·정리·초안 작성), 양순이(반복 작업·알림), 또는 방향 결정/코드·문서 리뷰가 필요하면 본인(주영봇)이 직접 맡는다.
2) 그 담당 봇 입장에서 지시에 대한 실제 응답(요청받은 작업의 결과물 또는 구체적인 다음 행동)을 짧고 실용적인 한국어로 작성한다.
반드시 아래 JSON 형식으로만 답하라. 다른 텍스트를 덧붙이지 마라.
{"bot":"담당봇 이름","reply":"담당봇의 실제 응답 내용"}`;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: cmd }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response(JSON.stringify({ error: "upstream error", detail }), {
        status: 502,
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    const data = await upstream.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    let parsed;
    try {
      parsed = JSON.parse(match ? match[0] : cleaned);
    } catch (e) {
      parsed = { bot: "주영봇", reply: text || "(응답을 이해하지 못했습니다)" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "content-type": "application/json" },
    });
  },
};
