export async function handleBbbAnalytics(req, res, env = process.env, fetcher = fetch) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json");
  const send = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method !== "GET") return send(405, { error: "Use GET." });
    const params = new URL(req.url, "http://localhost").searchParams;
    const operation = params.get("operation") || "definitions";
    if (!["definitions", "graph", "single", "products"].includes(operation))
      return send(400, { error: "Unknown analytics operation." });
    const token = req.headers.authorization;
    if (typeof token !== "string" || !/^Bearer \S+$/.test(token))
      return send(401, { error: "Please sign in again." });
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!base || !key) return send(503, { error: "Workspace authentication is not configured." });
    const headers = { apikey: key, Authorization: token, "Content-Type": "application/json" };
    const [user, permission] = await Promise.all([
      fetcher(`${base}/auth/v1/user`, {
        headers,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
      fetcher(`${base}/rest/v1/rpc/workspace_can_access`, {
        method: "POST",
        headers,
        body: JSON.stringify({ page_key: "bbb_analytics", action_key: "read" }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      }),
    ]);
    if (!user.ok || !(await user.json()).id) return send(401, { error: "Please sign in again." });
    if (!permission.ok) return send(503, { error: "Unable to verify permissions." });
    if ((await permission.json()) !== true)
      return send(403, { error: "You do not have permission to view BuiltByBit analytics." });
    if (!env.BBB_API_TOKEN)
      return send(503, {
        error: "Set BBB_API_TOKEN on the server to enable BuiltByBit analytics.",
      });
    if (operation === "products") {
      if ([...params.keys()].some((key) => key !== "operation"))
        return send(400, { error: "Invalid product parameter." });
      const products = new Map();
      let source = "builtbybit",
        warning = "";
      try {
        for (let page = 1; page <= 100; page++) {
          const response = await fetcher(
            `https://api.builtbybit.com/v2/resources/creator/resources?page=${page}&per_page=100`,
            {
              headers: { Authorization: `Token ${env.BBB_API_TOKEN}` },
              signal: AbortSignal.timeout(15000),
              redirect: "error",
            },
          );
          const result = await response.json();
          if (!response.ok || result.result !== "success")
            throw new Error("Product listing unavailable");
          for (const resource of result.data?.resources || []) {
            if (
              !(Number(resource.published_at) > 0) ||
              Number(resource.published_at) * 1000 > Date.now() ||
              resource.is_public === false ||
              resource.is_listed === false ||
              ["deleted", "draft", "unpublished", "hidden"].includes(
                resource.resource_state || resource.state,
              )
            )
              continue;
            products.set(String(resource.resource_id), {
              id: String(resource.resource_id),
              name: resource.title || resource.name || `Resource ${resource.resource_id}`,
              purchases: Number(resource.purchase_count ?? resource.purchases ?? 0),
            });
          }
          if (page >= (result.data?.stats?.max_page || 1)) break;
          if (page === 100) warning = "Showing the first 10,000 products.";
        }
      } catch {
        // Synced licensing products have no reliable marketplace publication status.
        return send(200, {
          products: [],
          warning:
            "Enable the BuiltByBit creator resources scope to list published products. The synced catalog cannot verify marketplace visibility.",
        });
      }
      return send(200, {
        products: [...products.values()]
          .filter((p) => /^\d+$/.test(p.id))
          .sort((a, b) => a.name.localeCompare(b.name)),
        source,
        warning,
      });
    }
    const upstream = new URL(
      `https://api.builtbybit.com/v2/analytics${operation === "definitions" ? "" : `/${operation}`}`,
    );
    for (const [name, value] of params) {
      if (name === "operation") continue;
      if (
        !/^(analytics|period|start_date|end_date|filters\[[A-Za-z0-9_]+\](?:\[\])?)$/.test(name) ||
        value.length > 500
      )
        return send(400, { error: "Invalid analytics parameter." });
      upstream.searchParams.append(name, value);
    }
    if (operation !== "definitions") {
      if (!params.get("analytics") || !params.get("period"))
        return send(400, { error: "Select a metric and period." });
      if (params.get("period") === "custom_range") {
        const start = params.get("start_date"),
          end = params.get("end_date");
        const valid = (value) =>
          /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
          Number.isFinite(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value;
        if (!valid(start) || !valid(end) || start > end)
          return send(400, { error: "Choose a valid date range with the start before the end." });
      }
    }
    const response = await fetcher(upstream, {
      headers: { Authorization: `Token ${env.BBB_API_TOKEN}` },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (response.headers.has("retry-after"))
      res.setHeader("Retry-After", response.headers.get("retry-after"));
    const result = await response.json();
    if (!response.ok || result.result !== "success")
      return send(response.ok ? 502 : response.status, {
        error:
          response.status === 429
            ? `BuiltByBit rate limit reached. Retry in ${Math.ceil(Number(response.headers.get("retry-after") || 1000) / 1000)} seconds.`
            : "BuiltByBit could not load analytics. Check the token, its analytics scope, and selected filters.",
      });
    return send(200, result.data);
  } catch {
    return send(503, { error: "BuiltByBit analytics is unavailable. Try again later." });
  }
}
