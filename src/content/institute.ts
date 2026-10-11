export const ABOUT_CAMPUS_IMAGE =
  "https://images.pexels.com/photos/10127241/pexels-photo-10127241.jpeg?auto=compress&cs=tinysrgb&w=1400";

const campusAddress = "Kathmandu, Nepal";

export const instituteInfo = {
  name: "DarbarTech",
  tagline: "GROUP OF TECHNOLOGY",
  about: {
    story:
      "DarbarTech Group of Technology started with a simple observation: Nepal has no shortage of talented, motivated people — what it has been short on is affordable, practical, hands-on training that actually prepares someone for a job or a freelance career on day one. From a foundation in basic computer literacy, typing, and office skills, DarbarTech has grown its course catalog to cover 15 career fields, from web development and AI engineering to graphic design, networking, and digital marketing — always built around the same philosophy: less lecture, more lab.",
    mission:
      "To empower every student with practical, job-ready digital skills through high-quality, affordable, and hands-on computer training — and to support them in their first career step after graduation.",
    vision:
      "To be the most trusted computer training institute in the region, known for producing skilled, ethical, and career-ready professionals in every field of information technology.",
  },
  contact: {
    phone: "+977-9760808629",
    whatsapp: "+977-9760808629",
    email: "info@darbarcomputer.edu.np",
    address: campusAddress,
    mapEmbed:
      `<iframe src="https://www.google.com/maps?q=${encodeURIComponent(
        campusAddress
      )}&output=embed" class="h-full w-full absolute inset-0" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`,
  },
  hours: [
    { day: "Sunday – Friday", time: "7:00 AM – 8:00 PM" },
    { day: "Saturday", time: "8:00 AM – 6:00 PM" },
    { day: "Public Holidays", time: "Closed (except pre-announced events)" },
  ],
  socials: [
    { name: "Facebook", url: "https://facebook.com/darbarcomputer", icon: "facebook" },
    { name: "Instagram", url: "https://instagram.com/darbarcomputer", icon: "instagram" },
    { name: "YouTube", url: "https://youtube.com/@darbarcomputer", icon: "youtube" },
    { name: "LinkedIn", url: "https://linkedin.com/company/darbarcomputer", icon: "linkedin" },
  ],
  stats: [
    { label: "Years of Training Excellence", value: "10+", isPlaceholder: true },
    { label: "Students Trained", value: "15+", isPlaceholder: true },
    { label: "Courses Offered", value: "37" },
    { label: "Certification Rate", value: "On-Time Completion Focused", isPlaceholder: true },
  ],
  whyChooseUs: [
    {
      title: "Certified, Industry-Experienced Trainers",
      description: "Not lecturers reading slides, but practitioners who've built the software, run the ad campaigns, or configured the networks they teach.",
      icon: "award",
    },
    {
      title: "Dedicated Hands-On Lab Access",
      description: "Dedicated, fully equipped computer labs with real practice time in every single session, not just theory hours.",
      icon: "monitor",
    },
    {
      title: "Career Support After Graduation",
      description: "Portfolio building, resume help, interview prep, and introductions through our hiring-partner network for eligible programs.",
      icon: "briefcase",
    },
    {
      title: "Batches That Fit Real Life",
      description: "Morning, day, and evening timings designed for students, job-seekers, and working professionals alike.",
      icon: "clock",
    },
    {
      title: "Small Class Sizes",
      description: "Intentionally kept small (8–15 students) so trainers can actually notice when you're stuck and give you individual time.",
      icon: "users",
    },
    {
      title: "Installments Available",
      description: "Flexible installment plans available so course fees and schedule don't become a barrier to your goals.",
      icon: "wallet",
    },
  ],
  team: [
    {
      id: "tm1",
      name: "Prashansa",
      role: "",
      specialty: "",
      image:
        "http://localhost:3000/uploads/darbar/admin/235b447d-a9d4-41ee-9953-7decfe2cacc4.jpg",
      isPlaceholder: false,
    },
    {
      id: "tm2",
      name: "Mohan",
      role: "",
      specialty: "",
      image:
        "http://localhost:3000/uploads/darbar/admin/1c9c0090-3468-4a0a-bd6d-f72b845cdc96.jpg",
      isPlaceholder: false,
    },
    {
      id: "tm3",
      name: "Niruta",
      role: "",
      specialty: "",
      image:
        "http://localhost:3000/uploads/darbar/admin/4b8e840e-b9d1-4ec1-a98b-23251bc677c6.png",
      isPlaceholder: false,
    },
  ],
  facilities: [
    "Fully-equipped computer labs with modern PCs",
    "High-speed Wi-Fi throughout the campus",
    "Dedicated project studio for design/video students",
    "Hardware lab for hands-on assembly and networking practice",
    "Student library with course reference books",
    "Counseling room for one-on-one career guidance",
  ],
  gallery: [
    { id: "g1", category: "Classroom", image: "https://images.pexels.com/photos/10638075/pexels-photo-10638075.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Students in classroom training" },
    { id: "g2", category: "Lab", image: "https://images.pexels.com/photos/18471480/pexels-photo-18471480.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Computer lab" },
    { id: "g3", category: "Lab", image: "https://images.pexels.com/photos/442154/pexels-photo-442154.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Hardware lab" },
    { id: "g4", category: "Events", image: "https://images.pexels.com/photos/17258012/pexels-photo-17258012.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Certification ceremony" },
    { id: "g5", category: "Classroom", image: "https://images.pexels.com/photos/10643463/pexels-photo-10643463.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Trainer with students" },
    { id: "g6", category: "Certificates", image: "https://images.pexels.com/photos/5940839/pexels-photo-5940839.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Student receiving certificate" },
    { id: "g7", category: "Events", image: "https://images.pexels.com/photos/5539293/pexels-photo-5539293.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Open house event" },
    { id: "g8", category: "Lab", image: "https://images.pexels.com/photos/3862632/pexels-photo-3862632.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Networking practice" },
    { id: "g9", category: "Certificates", image: "https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg?auto=compress&cs=tinysrgb&w=1200", alt: "Group photo with certificates" },
  ],
  galleryCategories: ["All", "Classroom", "Lab", "Events", "Certificates"],
};
