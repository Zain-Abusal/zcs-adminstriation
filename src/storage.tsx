import { useState } from "react";
import { Button, Panel, Field, SectionHeading, inputClass } from "@/components/kit";
import { useToast } from "@/lib/toast-context";
import { db, requireAccess } from "./client";
import { useAccess } from "./access";
import { errorMessage as message } from "./feedback";
type Row = Record<string, any>;
export function Storage() {
  const access = useAccess();
  const { toast } = useToast();
  const [bucket, setBucket] = useState("product-images"),
    [prefix, setPrefix] = useState(""),
    [files, setFiles] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function list() {
    setBusy(true);
    setError("");
    try {
      await requireAccess("storage");
      const { data, error } = await db!.storage.from(bucket).list(prefix, { limit: 100 });
      if (error) throw error;
      setFiles(data || []);
    } catch (e) {
      setError(message(e));
      toast({ title: "Action failed", description: message(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <SectionHeading
        as="h1"
        eyebrow="Assets"
        title="File storage"
        lead="Upload files, then copy their paths into product records. Product files remain private."
      />
      {error && <p role="alert">{error}</p>}
      <Panel className="storage-panel">
        <Field label="Bucket">
          <select
            className={inputClass}
            value={bucket}
            onChange={(e) => {
              setBucket(e.target.value);
              setFiles([]);
            }}
          >
            <option>product-images</option>
            <option>product-files</option>
          </select>
        </Field>
        <Field label="Folder path">
          <input
            className={inputClass}
            value={prefix}
            onChange={(e) => {
              setPrefix(e.target.value);
              setFiles([]);
            }}
            placeholder="products/example"
          />
        </Field>
        <Button onClick={() => void list()} disabled={busy}>
          List files (up to 100)
        </Button>
        <Field label="Upload a new file">
          <input
            className={inputClass}
            type="file"
            disabled={busy || !access.can("storage", "edit")}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                await requireAccess("storage", "edit");
                const path = [prefix.replace(/^\/+|\/+$/g, ""), file.name]
                  .filter(Boolean)
                  .join("/");
                const { error } = await db!.storage
                  .from(bucket)
                  .upload(path, file, { upsert: false });
                if (error) throw error;
                toast({ title: "File uploaded", description: path });
                await list();
              } catch (e) {
                setError(message(e));
                toast({ title: "Upload failed", description: message(e), tone: "error" });
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
        {files.map((file) => (
          <p key={file.name}>
            <code>{[prefix, file.name].filter(Boolean).join("/")}</code>
            {!file.id && " (folder)"}
          </p>
        ))}
      </Panel>
    </section>
  );
}
