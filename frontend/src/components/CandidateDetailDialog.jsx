import { fileUrl } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, User, MapPin, Briefcase, GraduationCap, Linkedin, Phone, Mail, Calendar, Building2 } from "lucide-react";

const Field = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <Icon className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-sm text-slate-800 break-words">{value || "—"}</p>
    </div>
  </div>
);

export default function CandidateDetailDialog({ candidate, open, onOpenChange }) {
  if (!candidate) return null;
  const c = candidate;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="candidate-detail-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">Candidate Profile</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-xl overflow-hidden bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            {c.photo_path ? (
              <img src={fileUrl(c.photo_path)} alt={c.name} className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-orange-300" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-xl font-bold text-slate-900">{c.name || "Unknown"}</h3>
            <p className="text-sm text-slate-500">{c.designation || "—"}{c.present_company ? ` · ${c.present_company}` : ""}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(c.skill_sets || []).slice(0, 8).map((s, i) => (
                <Badge key={i} variant="secondary" className="bg-orange-50 text-orange-700 border border-orange-100 font-medium">{s}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field icon={Mail} label="Email" value={c.email} />
          <Field icon={Phone} label="Mobile" value={c.mobile_number} />
          <Field icon={MapPin} label="City" value={c.city} />
          <Field icon={MapPin} label="Preferred Location" value={c.preferred_location} />
          <Field icon={Calendar} label="Date of Birth" value={c.date_of_birth} />
          <Field icon={User} label="Age" value={c.age} />
          <Field icon={Building2} label="Industry" value={c.industry} />
          <Field icon={Briefcase} label="Present Company" value={c.present_company} />
          <Field icon={Briefcase} label="CTC" value={c.ctc} />
          <Field icon={Calendar} label="Notice Period" value={c.notice_period} />
          <Field icon={GraduationCap} label="Highest Qualification" value={c.highest_qualification} />
          <Field icon={Linkedin} label="LinkedIn" value={c.linkedin_url} />
          <Field icon={User} label="Parsed By" value={c.parsed_by_name} />
          <Field icon={Calendar} label="Date of Parsing" value={c.date_of_parsing ? new Date(c.date_of_parsing).toLocaleString() : "—"} />
        </div>

        {c.resume_path && (
          <a href={fileUrl(c.resume_path)} target="_blank" rel="noreferrer" download className="block mt-4" data-testid="candidate-resume-download-button">
            <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold">
              <Download className="h-4 w-4 mr-2" /> Download Resume ({c.resume_filename || "file"})
            </Button>
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
