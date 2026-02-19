import { useState } from 'react';
import { useAppStore } from '../store';
import type { Applicant } from '../store';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Users, Briefcase, TrendingUp, AlertCircle, Phone, Mail, FileText, MapPin, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";

export default function Dashboard() {
  const { applicants, jobs } = useAppStore();
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const totalApplicants = applicants.length;
  const activeJobs = jobs.length;
  const avgScore = Math.round(
    applicants.reduce((acc, curr) => acc + curr.aiScore, 0) / totalApplicants
  );

  const stageData = [
    { name: 'Applied', value: applicants.filter((a) => a.stage === 'Applied').length },
    { name: 'Screening', value: applicants.filter((a) => a.stage === 'Screening').length },
    { name: 'Interview', value: applicants.filter((a) => a.stage === 'Interview').length },
    { name: 'Offer', value: applicants.filter((a) => a.stage === 'Offer').length },
    { name: 'Rejected', value: applicants.filter((a) => a.stage === 'Rejected').length },
  ];

  const recentApplicants = [...applicants]
    .sort((a, b) => b.aiScore - a.aiScore) // Sort by score for "top candidates"
    .slice(0, 3);

  const stats = [
    { label: 'Total Applicants', value: totalApplicants, icon: Users, change: '+12%', color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Active Jobs', value: activeJobs, icon: Briefcase, change: '+2', color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Avg AI Score', value: avgScore, icon: TrendingUp, change: '+5%', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Pending Review', value: 8, icon: AlertCircle, change: '-3', color: 'text-amber-600', bg: 'bg-amber-100' },
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

  const handleApplicantClick = (applicant: Applicant) => {
    setSelectedApplicant(applicant);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
        <div className="flex space-x-2">
          <select className="rounded-md border-slate-300 py-1.5 text-sm font-medium shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="overflow-hidden rounded-xl bg-white p-5 shadow-sm border border-slate-100 transition-all hover:shadow-md">
            <div className="flex items-center">
              <div className={`flex-shrink-0 rounded-md p-3 ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-slate-500">{stat.label}</dt>
                  <dd>
                    <div className="text-2xl font-semibold text-slate-900">{stat.value}</div>
                  </dd>
                </dl>
              </div>
            </div>
            <div className="mt-4">
               <span className={`text-sm font-medium ${stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                 {stat.change}
               </span>
               <span className="ml-2 text-sm text-slate-400">from last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Applicant Pipeline</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData}>
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 w-full text-left">Distribution by Stage</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Candidates */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Top AI Matches</h2>
          <a href="/applicants" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">View all</a>
        </div>
        <div className="space-y-4">
          {recentApplicants.map((applicant) => (
             <div 
                key={applicant.id} 
                onClick={() => handleApplicantClick(applicant)}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group border border-transparent hover:border-slate-200"
             >
                <div className="flex items-center space-x-3">
                  <img src={applicant.avatar} alt="" className="h-10 w-10 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{applicant.name}</p>
                    <p className="text-xs text-slate-500">{applicant.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden sm:flex flex-col items-end mr-4">
                     <span className="text-xs text-slate-400">Stage</span>
                     <Badge variant="secondary" className="mt-1">{applicant.stage}</Badge>
                  </div>
                  <div className="text-right min-w-[60px]">
                    <span className="block text-lg font-bold text-emerald-600">{applicant.aiScore}%</span>
                    <span className="text-xs text-slate-400">Match</span>
                  </div>
                </div>
             </div>
          ))}
        </div>
      </div>

      {/* Candidate Detail Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-start gap-4">
              {selectedApplicant && (
                <>
                  <img src={selectedApplicant.avatar} alt={selectedApplicant.name} className="h-16 w-16 rounded-full border-2 border-slate-100" />
                  <div className="flex-1 text-left">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                      {selectedApplicant.name}
                      <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-700">{selectedApplicant.aiScore}% Match</Badge>
                    </DialogTitle>
                    <DialogDescription className="text-base mt-1 flex items-center gap-2">
                      {selectedApplicant.role} • {selectedApplicant.experience}y Exp
                    </DialogDescription>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                         <Mail className="h-3.5 w-3.5" /> {selectedApplicant.email}
                      </div>
                      <div className="flex items-center gap-1">
                         <Phone className="h-3.5 w-3.5" /> {selectedApplicant.phone}
                      </div>
                      <div className="flex items-center gap-1">
                         <MapPin className="h-3.5 w-3.5" /> {selectedApplicant.location}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </DialogHeader>
          
          <ScrollArea className="flex-1 bg-slate-50/50">
             <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Sidebar Info */}
                <div className="space-y-6">
                   <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                         <TrendingUp className="h-4 w-4 text-emerald-600" /> Match Analysis
                      </h3>
                      <div className="space-y-3 text-sm">
                         <div>
                            <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">Pros</span>
                            <ul className="list-disc list-inside text-slate-600 mt-1 space-y-1">
                               {selectedApplicant?.matchAnalysis.pros.map(pro => (
                                  <li key={pro}>{pro}</li>
                               ))}
                            </ul>
                         </div>
                         <Separator />
                         <div>
                            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Cons</span>
                            <ul className="list-disc list-inside text-slate-600 mt-1 space-y-1">
                               {selectedApplicant?.matchAnalysis.cons.map(con => (
                                  <li key={con}>{con}</li>
                               ))}
                            </ul>
                         </div>
                      </div>
                   </div>

                   <div className="bg-white p-4 rounded-lg border shadow-sm">
                      <h3 className="font-semibold mb-3">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                         {selectedApplicant?.skills.map(skill => (
                            <Badge key={skill} variant="outline">{skill}</Badge>
                         ))}
                      </div>
                   </div>
                </div>

                {/* Main Content / CV Preview */}
                <div className="md:col-span-2 space-y-6">
                   <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                         <FileText className="h-5 w-5 text-slate-500" /> Resume / CV
                      </h3>
                      <Button variant="outline" size="sm">Download PDF</Button>
                   </div>
                   
                   {/* Mock PDF Viewer */}
                   <div className="bg-white border shadow-sm min-h-[500px] p-8 md:p-12 relative mx-auto max-w-[210mm] text-slate-800">
                      {selectedApplicant && (
                         <div className="space-y-6 font-serif">
                            <div className="border-b-2 border-slate-800 pb-4 mb-6">
                               <h1 className="text-3xl font-bold uppercase tracking-widest text-slate-900">{selectedApplicant.name}</h1>
                               <p className="text-lg italic text-slate-600 mt-1">{selectedApplicant.role}</p>
                               <div className="flex gap-4 mt-2 text-sm text-slate-500 font-sans">
                                  <span>{selectedApplicant.email}</span> • <span>{selectedApplicant.phone}</span> • <span>{selectedApplicant.location}</span>
                               </div>
                            </div>
                            
                            <section>
                               <h4 className="text-sm font-bold uppercase tracking-wider border-b border-slate-300 pb-1 mb-2 text-slate-400 font-sans">Professional Summary</h4>
                               <p className="leading-relaxed text-justify">
                                  {selectedApplicant.summary} 
                                  {" "}
                                  Driven professional with {selectedApplicant.experience} years of experience. 
                                  Proven track record in delivering high-quality results. 
                                  Adept at working in agile environments and collaborating with cross-functional teams to achieve business goals.
                               </p>
                            </section>

                            <section>
                               <h4 className="text-sm font-bold uppercase tracking-wider border-b border-slate-300 pb-1 mb-2 text-slate-400 font-sans">Experience</h4>
                               <div className="space-y-4">
                                  <div>
                                     <div className="flex justify-between font-bold">
                                        <span>Senior {selectedApplicant.role.replace('Senior ', '')}</span>
                                        <span>2021 - Present</span>
                                     </div>
                                     <div className="italic text-slate-600 mb-1">TechCorp Inc.</div>
                                     <ul className="list-disc list-outside ml-4 space-y-1 text-sm">
                                        <li>Led a team of developers to rebuild the core platform, improving performance by 40%.</li>
                                        <li>Implemented automated testing pipelines, reducing deployment errors by 25%.</li>
                                        <li>Mentored junior developers and conducted code reviews.</li>
                                     </ul>
                                  </div>
                                  <div>
                                     <div className="flex justify-between font-bold">
                                        <span>{selectedApplicant.role.replace('Senior ', '')}</span>
                                        <span>2018 - 2021</span>
                                     </div>
                                     <div className="italic text-slate-600 mb-1">Innovate Solutions</div>
                                     <ul className="list-disc list-outside ml-4 space-y-1 text-sm">
                                        <li>Developed and maintained client-facing features using modern web technologies.</li>
                                        <li>Collaborated with designers to implement responsive UI components.</li>
                                     </ul>
                                  </div>
                               </div>
                            </section>

                            <section>
                               <h4 className="text-sm font-bold uppercase tracking-wider border-b border-slate-300 pb-1 mb-2 text-slate-400 font-sans">Education</h4>
                               <div>
                                  <div className="flex justify-between font-bold">
                                     <span>Bachelor of Science in Computer Science</span>
                                     <span>2014 - 2018</span>
                                  </div>
                                  <div className="italic text-slate-600">University of Technology</div>
                               </div>
                            </section>
                         </div>
                      )}
                   </div>
                </div>
             </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
