import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import type { Stage } from "../store";
import { supabase } from "../lib/supabase";
import { ScoreRing } from '../components/ScoreRing';
import { 
  ArrowLeft, Mail, Phone, MapPin, Download, ThumbsUp, ThumbsDown, 
  CheckCircle, XCircle, Clock, Calendar, MessageSquare, ExternalLink
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer 
} from 'recharts';
import { clsx } from 'clsx';
import { motion } from "framer-motion";

type CandidateDetailRecord = {
  id: string;
  full_name: string;
  job_title: string;
  email: string | null;
  location: string | null;
  years_experience: number | null;
  ats_score: number | null;
  skills: string[] | null;
  analysis_summary: string | null;
  analysis_strengths: string[] | null;
  analysis_concerns: string[] | null;
  skill_profile: Record<string, number> | null;
  resume_preview_url: string | null;
};

export default function CandidateDetail() {
  const { id } = useParams();
  const [candidate, setCandidate] = useState<CandidateDetailRecord | null>(null);
  const [stage, setStage] = useState<Stage>("Applied");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCandidate = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id, full_name, job_title, email, location, years_experience, ats_score, skills, analysis_summary, analysis_strengths, analysis_concerns, skill_profile, resume_preview_url",
        )
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error) {
        setCandidate(null);
        setIsLoading(false);
        return;
      }

      setCandidate(data as CandidateDetailRecord);
      setIsLoading(false);
    };

    loadCandidate();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const radarData = useMemo(() => {
    if (!candidate) {
      return [
        { subject: "Technical", A: 0, fullMark: 100 },
        { subject: "Culture", A: 0, fullMark: 100 },
        { subject: "Communication", A: 0, fullMark: 100 },
        { subject: "Experience", A: 0, fullMark: 100 },
        { subject: "Leadership", A: 0, fullMark: 100 },
        { subject: "Problem Solving", A: 0, fullMark: 100 },
      ];
    }

    const profile = candidate.skill_profile;
    if (profile) {
      return [
        { subject: "Technical", A: profile.technical ?? 0, fullMark: 100 },
        { subject: "Culture", A: profile.culture ?? 0, fullMark: 100 },
        { subject: "Communication", A: profile.communication ?? 0, fullMark: 100 },
        { subject: "Experience", A: profile.experience ?? 0, fullMark: 100 },
        { subject: "Leadership", A: profile.leadership ?? 0, fullMark: 100 },
        { subject: "Problem Solving", A: profile.problem_solving ?? 0, fullMark: 100 },
      ];
    }

    const score = candidate.ats_score ?? 0;
    const years = Number(candidate.years_experience ?? 0);

    return [
      { subject: "Technical", A: score, fullMark: 100 },
      { subject: "Culture", A: Math.max(score - 10, 0), fullMark: 100 },
      {
        subject: "Communication",
        A: Math.min(score + 5, 100),
        fullMark: 100,
      },
      { subject: "Experience", A: Math.min(years * 10, 100), fullMark: 100 },
      { subject: "Leadership", A: Math.max(score - 20, 0), fullMark: 100 },
      { subject: "Problem Solving", A: Math.max(score - 5, 0), fullMark: 100 },
    ];
  }, [candidate]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading candidate...</div>;
  }

  if (!candidate) {
    return <div className="p-8 text-center">Candidate not found</div>;
  }

  const stages: Stage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected'];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/applicants" className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{candidate.full_name}</h1>
              <p className="text-sm text-slate-500">Applied for <span className="font-medium text-slate-700">{candidate.job_title}</span></p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
             <div className="flex bg-slate-100 rounded-lg p-1">
                {stages.map((stageItem) => (
                  <button
                    key={stageItem}
                    onClick={() => setStage(stageItem)}
                    className={clsx(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      stage === stageItem 
                        ? 'bg-white text-indigo-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    {stageItem}
                  </button>
                ))}
             </div>
             <button className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
               <MessageSquare className="mr-2 h-4 w-4" />
               Contact
             </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
           
           {/* Top Stats */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                   <div className="p-1.5 bg-indigo-100 rounded-md mr-3">
                     <Clock className="h-5 w-5 text-indigo-600" />
                   </div>
                   AI Analysis Summary
                 </h2>
                 <p className="text-slate-600 leading-relaxed mb-6">
                  {candidate.analysis_summary ?? "AI analysis pending."}
                </p>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                       <h3 className="text-sm font-bold text-emerald-800 mb-3 flex items-center">
                         <ThumbsUp className="h-4 w-4 mr-2" />
                         Strengths
                       </h3>
                       <ul className="space-y-2">
                        {(candidate.analysis_strengths ?? []).map((pro, i) => (
                          <li key={i} className="flex items-start text-sm text-emerald-700">
                            <CheckCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                            {pro}
                          </li>
                        ))}
                       </ul>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                       <h3 className="text-sm font-bold text-red-800 mb-3 flex items-center">
                         <ThumbsDown className="h-4 w-4 mr-2" />
                         Potential Concerns
                       </h3>
                       <ul className="space-y-2">
                        {(candidate.analysis_concerns ?? []).map((con, i) => (
                          <li key={i} className="flex items-start text-sm text-red-700">
                            <XCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 opacity-70" />
                            {con}
                          </li>
                        ))}
                       </ul>
                    </div>
                 </div>
              </div>

              {/* Score Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
                 <h2 className="text-lg font-semibold text-slate-900 mb-6">Overall Match Score</h2>
                <ScoreRing score={candidate.ats_score ?? 0} size="lg" />
                 <p className="mt-6 text-sm text-slate-500">
                   Based on skills, experience, and role requirements match.
                 </p>
                 <div className="mt-8 w-full">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Technical</span>
                      <span className="font-medium text-slate-700">95%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                      <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '95%' }}></div>
                    </div>
                    
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Culture</span>
                      <span className="font-medium text-slate-700">88%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: '88%' }}></div>
                    </div>
                 </div>
              </div>
           </div>

           {/* Skills & Resume */}
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <h2 className="text-lg font-semibold text-slate-900 mb-4">Skills Profile</h2>
                 <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                          name="Candidate"
                          dataKey="A"
                          stroke="#4f46e5"
                          strokeWidth={2}
                          fill="#6366f1"
                          fillOpacity={0.4}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="mt-4 flex flex-wrap gap-2">
                    {(candidate.skills ?? []).map(skill => (
                       <span key={skill} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium border border-slate-200">
                         {skill}
                       </span>
                     ))}
                 </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-slate-900">Experience & Education</h2>
                    <button className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center">
                       <ExternalLink className="h-4 w-4 mr-1" />
                       View Original Resume
                    </button>
                 </div>
                 
                 <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 pl-8 pb-4">
                    <div className="relative">
                       <span className="absolute -left-[41px] top-0 h-6 w-6 rounded-full border-4 border-white bg-indigo-600"></span>
                       <h3 className="text-base font-bold text-slate-900">Senior Software Engineer</h3>
                       <p className="text-sm text-slate-600">TechCorp Inc. • 2020 - Present</p>
                       <p className="mt-2 text-sm text-slate-600">
                         Led a team of 5 developers in re-architecting the core payment processing system.
                         Implemented microservices architecture reducing latency by 40%.
                       </p>
                    </div>
                    <div className="relative">
                       <span className="absolute -left-[41px] top-0 h-6 w-6 rounded-full border-4 border-white bg-slate-300"></span>
                       <h3 className="text-base font-bold text-slate-900">Software Developer</h3>
                       <p className="text-sm text-slate-600">StartupXYZ • 2018 - 2020</p>
                       <p className="mt-2 text-sm text-slate-600">
                         Full stack development using React and Node.js.
                       </p>
                    </div>
                    <div className="relative">
                       <span className="absolute -left-[41px] top-0 h-6 w-6 rounded-full border-4 border-white bg-slate-300"></span>
                       <h3 className="text-base font-bold text-slate-900">BS Computer Science</h3>
                       <p className="text-sm text-slate-600">University of Technology • 2014 - 2018</p>
                    </div>
                 </div>
              </div>
           </div>

        </div>

        {/* Right Sidebar (Contact Info) */}
        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-6 hidden xl:block">
           <div className="flex flex-col items-center mb-8">
            {candidate.resume_preview_url ? (
              <img src={candidate.resume_preview_url} className="h-24 w-24 rounded-full object-cover ring-4 ring-slate-50 mb-4" />
            ) : (
              <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-600 ring-4 ring-slate-50">
                {candidate.full_name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <h2 className="text-lg font-bold text-slate-900">{candidate.full_name}</h2>
            <p className="text-sm text-slate-500">{candidate.location ?? "Location pending"}</p>
           </div>
           
           <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contact Information</h3>
                <div className="space-y-3">
                   <div className="flex items-center text-sm text-slate-600">
                      <Mail className="h-4 w-4 mr-3 text-slate-400" />
                      {candidate.email ?? "Email pending"}
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <Phone className="h-4 w-4 mr-3 text-slate-400" />
                      Not provided
                    </div>
                    <div className="flex items-center text-sm text-slate-600">
                      <MapPin className="h-4 w-4 mr-3 text-slate-400" />
                      {candidate.location ?? "Location pending"}
                    </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Attachments</h3>
                 <div className="space-y-3">
                    <div className="flex items-center p-3 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors cursor-pointer bg-slate-50">
                       <div className="h-8 w-8 bg-red-100 rounded flex items-center justify-center text-red-600 font-bold text-xs mr-3">
                         PDF
                       </div>
                       <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-slate-700 truncate">Resume_Final.pdf</p>
                          <p className="text-xs text-slate-500">2.4 MB</p>
                       </div>
                       <Download className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="flex items-center p-3 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors cursor-pointer bg-slate-50">
                       <div className="h-8 w-8 bg-blue-100 rounded flex items-center justify-center text-blue-600 font-bold text-xs mr-3">
                         DOC
                       </div>
                       <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-slate-700 truncate">Cover_Letter.docx</p>
                          <p className="text-xs text-slate-500">1.1 MB</p>
                       </div>
                       <Download className="h-4 w-4 text-slate-400" />
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
