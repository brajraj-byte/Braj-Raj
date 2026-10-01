import { useState, useEffect, useCallback, useRef } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CandidateTable from "@/components/CandidateTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, Loader2, FileText, Sparkles, CheckCircle2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ParseResume() {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [recent, setRecent] = useState([]);
  const [drag, setDrag] = useState(false);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(() => {
    api.get("/resumes").then(({ data }) => setRecent(data.slice(0, 10))).catch(() => {});
  }, []);
  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, [load]);

  const addFiles = (list) => {
    const arr = Array.from(list || []);
    if (arr.length) setFiles((prev) => [...prev, ...arr]);
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const parseSingle = async () => {
    const fd = new FormData();
    fd.append("file", files[0]);
    const { data } = await api.post("/resumes/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
    toast.success(`Parsed: ${data.name || files[0].name}`);
  };

  const pollJob = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/resumes/bulk/${jobId}`);
        setJob(data);
        if (data.status === "completed") {
          clearInterval(pollRef.current);
          setParsing(false);
          const ok = data.results.filter((r) => r.status === "done").length;
          toast.success(`Bulk parsing complete — ${ok}/${data.total} resumes added`);
          load();
        }
      } catch { clearInterval(pollRef.current); setParsing(false); }
    }, 1800);
  };

  const parseBulk = async () => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const { data } = await api.post("/resumes/parse-bulk", fd, { headers: { "Content-Type": "multipart/form-data" } });
    setJob({ total: data.total, done: 0, status: "processing", results: [] });
    pollJob(data.job_id);
  };

  const upload = async () => {
    if (!files.length) return;
    setParsing(true);
    setJob(null);
    try {
      if (files.length === 1) {
        await parseSingle();
        setFiles([]);
        setParsing(false);
        load();
      } else {
        await parseBulk();
        setFiles([]);
      }
    } catch (ex) {
      toast.error(apiError(ex));
      setParsing(false);
    }
  };

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Parse Resume</h2>
        <p className="text-sm text-slate-500">Upload one or many resumes (PDF, DOC, DOCX, TXT, HTML) — AI extracts all candidate details into the shared database.</p>
      </div>

      <Card className="p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${drag ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-slate-50/50"}`}
          data-testid="resume-dropzone"
        >
          <UploadCloud className="h-10 w-10 text-orange-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Drag & drop resumes here, or click to browse — <span className="font-semibold text-slate-700">bulk upload supported</span></p>
          <input id="resume-file" type="file" multiple accept=".pdf,.doc,.docx,.txt,.html,.htm" className="hidden"
            onChange={(e) => addFiles(e.target.files)} data-testid="resume-file-input" />
          <label htmlFor="resume-file">
            <span className="inline-block mt-4 text-sm font-semibold text-orange-600 cursor-pointer hover:underline">Choose files</span>
          </label>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2" data-testid="selected-files">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="truncate flex-1 text-slate-700">{f.name}</span>
                {!parsing && <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500" data-testid={`remove-file-${i}`}><X className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        )}

        <Button onClick={upload} disabled={!files.length || parsing}
          className="w-full mt-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold h-11"
          data-testid="parse-resume-button">
          {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing with AI…</>
            : <><Sparkles className="h-4 w-4 mr-2" /> Parse {files.length > 1 ? `${files.length} Resumes` : "& Add to Database"}</>}
        </Button>
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Parsed by {user?.name} · visible to all team members</p>

        {job && (
          <div className="mt-5 border-t border-slate-100 pt-4" data-testid="bulk-progress">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700">{job.status === "completed" ? "Completed" : "Processing…"}</span>
              <span className="text-slate-500">{job.done}/{job.total}</span>
            </div>
            <Progress value={pct} className="h-2" />
            {job.results?.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
                {job.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm" data-testid={`bulk-result-${i}`}>
                    {r.status === "done"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="truncate text-slate-600">{r.filename}</span>
                    {r.status === "done" && <span className="text-slate-400 truncate">→ {r.name}</span>}
                    {r.status === "error" && <span className="text-red-400 text-xs">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div>
        <h3 className="font-heading text-lg font-semibold text-slate-900 mb-3">Recently parsed</h3>
        <CandidateTable candidates={recent} onChanged={load} emptyText="No resumes parsed yet. Upload your first resume above." />
      </div>
    </div>
  );
}
