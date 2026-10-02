import { useEffect, useState } from "react";
import { db } from "./client";
import { errorMessage } from "./feedback";
export type FilterChoice = { value: string; label: string };
export function useFilterOptions(page: string, revision: number) {
  const [choices, setChoices] = useState<Record<string, FilterChoice[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setChoices({});
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const result = await db!.rpc("workspace_filter_options", { page_key: page });
        if (result.error) throw result.error;
        if (active) setChoices(result.data || {});
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, revision]);
  return { choices, error, loading };
}
