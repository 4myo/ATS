import { create } from 'zustand';

export type Stage = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Rejected';

export interface Applicant {
  id: string;
  name: string;
  role: string;
  stage: Stage;
  aiScore: number;
  skills: string[];
  experience: number;
  location: string;
  avatar: string;
  email: string;
  phone: string;
  summary: string;
  analysisStrengths?: string[];
  analysisConcerns?: string[];
  skillProfile?: {
    technical: number;
    communication: number;
    experience: number;
    leadership: number;
    problemSolving: number;
    culture: number;
  };
  matchAnalysis: {
    pros: string[];
    cons: string[];
  };
}

export interface Job {
  id: string;
  title: string;
  description?: string;
  department: string;
  location: string;
  type: string;
  applicantsCount: number;
  postedAt: string;
}

interface AppState {
  applicants: Applicant[];
  jobs: Job[];
  selectedApplicantId: string | null;
  setSelectedApplicantId: (id: string | null) => void;
  updateApplicantStage: (id: string, stage: Stage) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedApplicantId: null,
  setSelectedApplicantId: (id) => set({ selectedApplicantId: id }),
  updateApplicantStage: (id, stage) =>
    set((state) => ({
      applicants: state.applicants.map((app) =>
        app.id === id ? { ...app, stage } : app
      ),
    })),
  jobs: [
    {
      id: '1',
      title: 'Senior Frontend Engineer',
      description:
        'Own frontend architecture, build React/TypeScript features, and collaborate with design and product on a modern web app.',
      department: 'Engineering',
      location: 'Remote',
      type: 'Full-time',
      applicantsCount: 45,
      postedAt: '2 days ago',
    },
    {
      id: '2',
      title: 'Product Designer',
      description:
        'Lead UX/UI for core workflows, create prototypes, and deliver design systems with strong user research foundations.',
      department: 'Design',
      location: 'New York, NY',
      type: 'Full-time',
      applicantsCount: 28,
      postedAt: '5 days ago',
    },
    {
      id: '3',
      title: 'Backend Developer',
      description:
        'Build scalable APIs and services, design data models, and improve system reliability for high-volume traffic.',
      department: 'Engineering',
      location: 'San Francisco, CA',
      type: 'Contract',
      applicantsCount: 12,
      postedAt: '1 week ago',
    },
  ],
  applicants: [
    {
      id: '101',
      name: 'Sarah Jenkins',
      role: 'Senior Frontend Engineer',
      stage: 'Interview',
      aiScore: 94,
      skills: ['React', 'TypeScript', 'Node.js', 'GraphQL'],
      experience: 6,
      location: 'Austin, TX',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      email: 'sarah.j@example.com',
      phone: '+1 (555) 123-4567',
      summary: 'Experienced frontend developer with a passion for building scalable web applications. Strong background in React ecosystem and performance optimization.',
      matchAnalysis: {
        pros: ['Strong React expertise', 'Consistent career growth', 'Excellent culture fit score'],
        cons: ['Higher salary expectation', 'Remote only'],
      },
    },
    {
      id: '102',
      name: 'Michael Chen',
      role: 'Senior Frontend Engineer',
      stage: 'Applied',
      aiScore: 88,
      skills: ['Vue.js', 'JavaScript', 'AWS', 'Python'],
      experience: 4,
      location: 'San Francisco, CA',
      avatar: 'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      email: 'm.chen@example.com',
      phone: '+1 (555) 987-6543',
      summary: 'Full stack developer matched for frontend role. Diverse skill set including cloud infrastructure and backend development.',
      matchAnalysis: {
        pros: ['Versatile skill set', 'Local candidate', 'Available immediately'],
        cons: ['Less specialized in React', 'Junior for "Senior" title'],
      },
    },
    {
      id: '103',
      name: 'Emily Davis',
      role: 'Product Designer',
      stage: 'Screening',
      aiScore: 92,
      skills: ['Figma', 'Sketch', 'Prototyping', 'User Research'],
      experience: 5,
      location: 'New York, NY',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      email: 'emily.d@example.com',
      phone: '+1 (555) 456-7890',
      summary: 'Creative product designer focused on user-centric design principles. Portfolio demonstrates strong visual design and UX research capabilities.',
      matchAnalysis: {
        pros: ['Strong portfolio', 'Relevant industry experience', 'Great communication skills'],
        cons: ['Limited coding knowledge'],
      },
    },
    {
      id: '104',
      name: 'David Wilson',
      role: 'Senior Frontend Engineer',
      stage: 'Rejected',
      aiScore: 45,
      skills: ['HTML', 'CSS', 'jQuery'],
      experience: 10,
      location: 'Remote',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      email: 'david.w@example.com',
      phone: '+1 (555) 222-3333',
      summary: 'Legacy web developer looking to transition to modern frameworks.',
      matchAnalysis: {
        pros: ['Deep understanding of web fundamentals'],
        cons: ['Outdated tech stack', 'Poor assessment score'],
      },
    },
    {
      id: '105',
      name: 'Jessica Kim',
      role: 'Product Designer',
      stage: 'Offer',
      aiScore: 97,
      skills: ['Figma', 'Motion Design', 'React', 'Design Systems'],
      experience: 7,
      location: 'New York, NY',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
      email: 'j.kim@example.com',
      phone: '+1 (555) 777-8888',
      summary: 'Unicorn designer who codes. Built and maintained design systems for Fortune 500 companies.',
      matchAnalysis: {
        pros: ['Rare skillset (Design + Code)', 'Leadership experience', 'Perfect culture fit'],
        cons: ['None identified'],
      },
    },
  ],
}));
