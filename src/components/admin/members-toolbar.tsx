"use client";

import { Download, Search, Upload, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { MemberForm } from "@/components/admin/member-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ImportResult = {
  created: number;
  skipped: { line: number; email: string; reason: string }[];
  errors: { line: number; message: string }[];
};

/** Search, add, CSV import and export for the members page. */
export function MembersToolbar() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState<ImportResult | null>(null);
  const [importing, startImport] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const search = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(params);
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    router.replace(`/admin/members${next.size ? `?${next}` : ""}`);
  };

  const importCsv = (chosen: File) =>
    startImport(async () => {
      const response = await fetch("/api/admin/members/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: await chosen.text(),
      }).catch(() => null);
      if (file.current) file.current.value = "";
      if (!response?.ok) {
        toast.error(
          response?.status === 413 ? "That file is too large (1 MB max)." : "Import failed.",
        );
        return;
      }
      const result = (await response.json()) as ImportResult;
      setReport(result);
      if (result.created) toast.success(`${result.created} members added.`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search members"
            placeholder="Search by name, email or phone"
            value={query}
            onChange={(event) => search(event.target.value)}
            className="h-11 rounded-xl pl-10 text-base"
          />
        </div>
        <Button onClick={() => setAdding(true)} className="h-11 rounded-xl px-4">
          <UserPlus aria-hidden />
          Add member
        </Button>
        <Button
          variant="outline"
          disabled={importing}
          onClick={() => file.current?.click()}
          className="h-11 rounded-xl px-4"
        >
          <Upload aria-hidden />
          {importing ? "Importing…" : "Import CSV"}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          hidden
          aria-label="CSV file to import"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) importCsv(chosen);
          }}
        />
        <Button asChild variant="ghost" className="h-11 rounded-xl px-3">
          <a href="/api/admin/export?type=members" download>
            <Download aria-hidden />
            Members CSV
          </a>
        </Button>
        <Button asChild variant="ghost" className="h-11 rounded-xl px-3">
          <a href="/api/admin/export?type=attendance" download>
            <Download aria-hidden />
            Attendance CSV
          </a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Import a CSV with a header row: <code className="font-mono">name,email,phone</code> (phone
        optional). Existing emails are skipped.
      </p>

      {report && (report.errors.length > 0 || report.skipped.length > 0) && (
        <div role="status" className="space-y-2 rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <p className="font-medium">
            Imported {report.created}. {report.skipped.length} skipped, {report.errors.length} with
            problems.
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-muted-foreground">
            {report.errors.map((e) => (
              <li key={`e${e.line}`}>
                Line {e.line}: {e.message}
              </li>
            ))}
            {report.skipped.map((s) => (
              <li key={`s${s.line}`}>
                Line {s.line}: {s.email} ({s.reason})
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>
              They can sign in straight away with a code sent to their email.
            </DialogDescription>
          </DialogHeader>
          <MemberForm mode="create" onDone={() => setAdding(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
