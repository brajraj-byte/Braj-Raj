import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CandidateTable from "@/components/CandidateTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadCloud, Loader2, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function ParseResume() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [recent, setRecent] = useState([]);
  const [drag, setDrag] = useState(false);

  const load = useCallback(() => {
    api.get("/resumes").then(({ data }) => setRecent(data.slice(0, 10))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const onFiles = (files) => { if (files && files[0]) setFile(files[0]); };

  const upload = async () => {
    if (!file) return;
    setParsing(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/resumes/parse", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Parsed: ${data.name || file.name}`);
      setFile(null);
      load();
    } catch (ex) {
      toast.error(apiError(ex));
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Parse Resume</h2>
        <p className="text-sm text-slate-500">Upload a PDF or DOCX resume — AI extracts all candidate details into the shared database.</p>
      </div>

      <Card className="p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${drag ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-slate-50/50"}`}
          data-testid="resume-dropzone"
        >
          <UploadCloud className="h-10 w-10 text-orange-500 mx-auto mb-3" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-slate-700">
              <FileText className="h-4 w-4 text-orange-500" /> <span className="font-medium">{file.name}</span>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Drag & drop a resume here, or click to browse (PDF / DOCX)</p>
          )}
          <input id="resume-file" type="file" accept=".pdf,.docx,.doc" className="hidden"
            onChange={(e) => onFiles(e.target.files)} data-testid="resume-file-input" />
          <label htmlFor="resume-file">
            <span className="inline-block mt-4 text-sm font-semibold text-orange-600 cursor-pointer hover:underline">Choose file</span>
          </label>
        </div>

        <Button onClick={upload} disabled={!file || parsing}
          className="w-full mt-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold h-11"
          data-testid="parse-resume-button">
          {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing with AI…</> : <><Sparkles className="h-4 w-4 mr-2" /> Parse & Add to Database</>}
        </Button>
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Parsed by {user?.name} · visible to all team members</p>
      </Card>

      <div>
        <h3 className="font-heading text-lg font-semibold text-slate-900 mb-3">Recently parsed</h3>
        <CandidateTable candidates={recent} emptyText="No resumes parsed yet. Upload your first resume above." />
      </div>
    </div>
  );
}
