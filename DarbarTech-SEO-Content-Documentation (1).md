# DarbarTech (Darbar Computer) — Website SEO Content Documentation

**Prepared for:** DarbarTech Group of Technology, Kathmandu, Nepal
**Site type:** Next.js computer training institute website (37 courses / 15 categories)
**Purpose:** Replace every placeholder, dummy value, and pricing display with launch-ready, SEO-optimized, conversion-focused content.

---

## Executive Summary

I opened and audited the actual project files (not a generic template). This is a **Next.js 14+ App Router site** for **DarbarTech / Darbar Computer**, a computer training institute in Kathmandu, Nepal, offering 37 courses across 15 categories — everything from Speed Typing to an Advanced AI Software Engineering Diploma. The codebase is well-structured (`src/content/*.ts` drives most copy), which is good news: replacing placeholder content is mostly a matter of editing a handful of data files rather than hunting through JSX.

Three things shaped how this documentation is built:

1. **There is no dedicated "Services" page.** The site's core offering *is* the course catalog — there's no separate consulting/services business unit. I've mapped the requested "Services" section onto the site's real equivalent: **Institutional & Corporate Training Programs** (school partnerships, corporate batches, career services), which can live as a new section on the About or Courses page, or its own `/corporate-training` page if you want to pursue B2B revenue later.

2. **Pricing is real, not placeholder.** `src/content/courses.ts` contains actual `feeNPR` values (NPR 3,000–75,000) with installment notes and seat-availability flags — this looks like genuine institute pricing, not dummy data. You asked me to remove all pricing site-wide. I've done that in the content recommendations below, but as your SEO/conversion advisor: **for a Nepali training institute, published fees are usually a trust signal, not a liability** — hidden pricing tends to increase bounce rate and WhatsApp/phone spam from bargain-hunters rather than increasing qualified leads. My recommendation is a **middle path** (Section 3), but I've documented the full "no visible pricing" version exactly as requested, since that's your call to make.

3. **37 full course write-ups would make this document unusably long.** I've written complete, launch-ready content for the **8 flagship/featured courses** (the ones the homepage and marketing already promote), plus a reusable **content template** and a **condensed data table** for the remaining 29 so your content writer can produce the rest in the same voice quickly.

---

## Website Content Audit

Findings from the actual source files:

| File | Issue found |
|---|---|
| `src/content/institute.ts` | `[PLACEHOLDER]` story, director/trainer names, phone, WhatsApp, address, Google Maps embed, and a `stats` array explicitly flagged `isPlaceholder: true` (12+ years, 3,000+ students, 98% certification rate) |
| `src/content/institute.ts` — `team` | 4 team members, all names are `[PLACEHOLDER: ... Name]`, all flagged `isPlaceholder: true` |
| `src/content/institute.ts` — `whyChooseUs` | One claim ("Government-Recognized Certification") explicitly marked `[Verify claim before publishing]` — **do not publish this without written proof of accreditation** |
| `src/content/testimonials.ts` | All 6 testimonials use "Sample Student One–Six" and are marked `isPlaceholder: true` — stock portrait photos, no real consent on file |
| `src/content/faq.ts` | 3 FAQ answers flagged `[Confirm actual institute policy]` (batch swaps, refund policy, certification/accreditation claims) |
| `src/content/courses.ts` | Real course data, but every `feeNPR` field is commented as "estimates, replace with real pricing" and `industryCertification` values (Microsoft, Google, Meta, Adobe, Cisco, AWS, Autodesk) are marked "illustrative pathway names — confirm real partnerships before publishing claims" |
| `src/content/blog/*.mdx` | All 5 blog posts are explicitly marked `[PLACEHOLDER SAMPLE POST]` in the body copy, including a "success story" about a student named "Rina" — this **must** be replaced with a real, consented graduate story or clearly relabeled as illustrative |
| `src/lib/constants.ts` | `SITE_CONFIG.phone` and `SITE_CONFIG.address` fall back to `+977-XX-XXXXXXX` and `[PLACEHOLDER Address]` when environment variables aren't set |

**Action required before launch (non-content, but urgent):** the "Government-Recognized Certification" claim and every `industryCertification` badge (Microsoft/Google/Meta/Adobe/Cisco/AWS/Autodesk) must be either verified with real partnership/authorization documentation or reworded as "aligned with," "prepares you for," or "based on the curriculum of" — publishing unverified certification-body logos or claims is a legal and reputational risk, not just an SEO one.

---

## Placeholder Content Replaced

Replaced in this document:
- Institute story, mission/vision framing, "Why Choose Us" copy
- All homepage sections (hero, stats framing, learning process, FAQs, final CTA)
- About Us page (story, mission, vision, values, team intro framing, achievements framing)
- Full content package for 8 flagship courses + template for the remaining 29
- Contact page copy and form helper text
- Footer copy
- All 6 testimonials → replaced with a **testimonial collection framework** (see Conversion Optimization) since fabricating named student quotes would be dishonest and legally risky — real quotes need real consent
- Blog strategy (categories, pillar pages, clusters) built around the 5 real posts already drafted

---

## Pricing Sections Removed — and a Straight Recommendation

As instructed, every course-fee display (`feeNPR`, `feeNote`, "Starting at," currency values) is removed from the on-page copy below and replaced with value propositions, outcomes, and consultation CTAs.

**My honest recommendation, since you're trusting me as your strategist:** don't go to zero. Nepali parents and job-seekers comparison-shop between institutes on Google and Facebook before they ever call — if Darbar Computer's course pages show no fee signal at all while competitors show "NPR X,XXX," you lose the click, not gain a lead. A better middle ground that keeps your "no hard pricing" goal while staying competitive:
- Show an **installment-availability badge** ("Installments available") without the number — this is retained in the copy below.
- Add a single line on every course page: *"Course fees are affordable and Nepal's most flexible installment plans are available — get your exact quote in a 5-minute call."*
- Put a **consultation-first CTA** ("Get My Course Fee & Batch Details") in place of a price tag — this converts better than "Contact Us" because it promises the visitor gets pricing, just not publicly.

All copy below follows the no-visible-pricing instruction; the italic notes flag where you may want to reconsider.

---

## Page-by-Page SEO Content

### Home

**H1 (Hero Title):** Learn the Digital Skills That Actually Get You Hired — Right Here in Kathmandu

**Hero Subtitle:** 37 Career-Focused Courses. Certified Trainers. Real Lab Time.

**Hero Description:** From your first email account to building full AI-powered software, DarbarTech's hands-on training turns beginners into job-ready professionals — with small batches, flexible morning-to-evening timings, and trainers who've actually worked in the field they teach.

**Primary CTA:** Explore Courses
**Secondary CTA:** Book a Free Consultation

**About (homepage teaser):**
DarbarTech Group of Technology is a Kathmandu-based computer training institute built around one idea: theory without practice doesn't get anyone hired. Every course pairs classroom fundamentals with dedicated lab time, live projects, and a portfolio you can actually show an employer — whether you're a SEE graduate exploring your first career path, a working professional upgrading your Excel skills, or a business owner learning to run your own AI-assisted marketing.

**Why Choose Us:**
- **Certified, industry-experienced trainers** — not lecturers reading slides, but practitioners who've built the software, run the ad campaigns, or configured the networks they teach
- **Dedicated hands-on lab access** in every single session, not just theory hours
- **Career support that doesn't end at graduation** — portfolio building, resume help, and introductions through our hiring-partner network
- **Batches that fit real life** — morning, day, and evening timings for students, job-seekers, and working professionals
- **Small class sizes** (8–15 students) so trainers can actually notice when you're stuck

**Key Features:** Live project work in every course · Portfolio-ready deliverables · AI-assisted learning tools built into modern courses · Optional internships on career-track programs · LMS access and lifetime notes

**Learning Process (How It Works):**
1. **Talk to a counselor** — tell us your goal (a job, a promotion, a business, a hobby) and we recommend the right course and batch
2. **Join a small, hands-on batch** — learn by doing, in a real lab, with a trainer who checks your work
3. **Build a portfolio project** — every course ends with something real you can show, not just a certificate
4. **Get career support** — resume, interview prep, and access to our employer network for career-track courses

**Statistics section:** *Replace the placeholder numbers (12+ years, 3,000+ students, 98% certification rate) with your institute's real, verifiable figures before publishing — false statistics are both an SEO and legal risk (FTC/consumer-protection-style "unsubstantiated claims" issues apply in Nepal too under the Consumer Protection Act). If you don't have exact figures yet, use ranges you can defend: "Hundreds of students trained," "15 career fields covered," "37 courses, one campus."*

**Success Stories (homepage teaser):** Point to 2–3 of your strongest blog success stories (see Blog section) with a "Read Their Story →" link, rather than a generic stat block.

**Testimonials:** See Conversion Optimization section — do not publish until real, consented reviews are collected.

**Partner Section:** Only list logos/names of organizations you have a documented relationship with (internship-hosting businesses, verified certification bodies). If none are confirmed yet, replace this section with **"Where Our Graduates Work"** — a text list of real job titles/industries alumni have entered (no names needed), which is honest and still builds credibility.

**Latest News:** Auto-pull the 3 most recent blog posts (this is already wired via `getFeaturedCourses`-style logic in the codebase for events — apply the same pattern to blog).

**FAQs (homepage — pull top 4 from full FAQ page):**
- *Do I need prior computer experience to enroll?* — No. Most courses assume zero experience; if a course needs a prerequisite, it's listed on that course's page.
- *Can I study in the evening if I work full-time?* — Yes, most courses offer morning, day, and evening batches.
- *Will I get a certificate?* — Yes, on completion of attendance requirements and your final project/assessment.
- *What if I want to switch batches after enrolling?* — Talk to our front desk within the first week; batch swaps depend on seat availability. *(Confirm this policy internally before publishing.)*

**Final CTA:** Not sure which course is right for you? **Talk to a course counselor free — no obligation, no pressure.**

---

### About Us

**H1:** About DarbarTech — Kathmandu's Hands-On Computer Training Institute

**Company Story:** *(Template — fill in your real founding year, founder motivation, and milestones)*
DarbarTech Group of Technology started with a simple observation: Nepal has no shortage of talented, motivated people — what it has been short on is affordable, practical, hands-on training that actually prepares someone for a job or a freelance career on day one. From a foundation in basic computer literacy, typing, and office skills, DarbarTech has grown its course catalog to cover 15 career fields, from web development and AI engineering to graphic design, networking, and digital marketing — always built around the same philosophy: **less lecture, more lab.**

**Mission:** To empower every student with practical, job-ready digital skills through high-quality, affordable, hands-on computer training — and to support them through their first career step after graduation.

**Vision:** To be the most trusted computer training institute in the region, known for producing skilled, ethical, career-ready professionals across every field of information technology.

**Values:**
- **Practice over theory** — every course includes real lab time and a portfolio project
- **Honesty in what we promise** — no inflated placement guarantees, no certification claims we can't back up
- **Accessibility** — flexible batch timings and installment options so cost and schedule aren't a barrier
- **Continuous relevance** — courses updated as the industry changes (AI tools are now built into our Office, Programming, and Marketing curricula)

**Why We Exist:** Most people don't need a four-year degree to start a career in tech, design, or digital business — they need focused, practical training and someone to vouch for their skills. That's the gap DarbarTech fills.

**Team Introduction:** *Replace placeholder names/photos with real trainer bios: name, role, 1–2 line background, and specialty. A short line like "8 years building production web apps before joining DarbarTech" builds far more trust than a stock photo and a generic title.*

**Achievements:** List concrete, verifiable milestones — number of course categories (15, verifiable from your own catalog), number of batches run per year, notable partnerships, internship placements. Avoid round, unverifiable numbers.

**Community Impact:** If you run free workshops, school outreach programs, or scholarship seats (as your Events content suggests), describe them here — this is genuinely strong E-E-A-T and local-relevance content for Google.

---

### Courses — Flagship Content (Full Package)

*Applying the full 10-field template to your 8 currently "featured" courses. Use the identical structure for the remaining 29 — a condensed table follows.*

#### 1. Professional Computer Operator
- **SEO Title:** Professional Computer Operator Course in Kathmandu | DarbarTech
- **SEO Description:** Become a job-ready computer operator in 12 weeks. Typing, MS Office, data entry, and troubleshooting — hands-on training with a Microsoft-aligned diploma.
- **Overview:** A complete beginner-to-job-ready package built for SEE/+2 graduates and job seekers who want one course that covers everything an office expects: fast typing, Office software fluency, internet and email literacy, and basic troubleshooting.
- **Learning Objectives:** Type accurately and quickly in English and Nepali · Operate MS Word, Excel, and PowerPoint confidently · Manage email, internet research, and basic file systems · Handle everyday data-entry and office-etiquette scenarios
- **Skills Covered:** Typing, MS Office, internet & email, data entry, basic troubleshooting, office etiquette
- **Prerequisites:** None — built for absolute beginners
- **Target Audience:** SEE graduates, +2 students, job seekers entering office roles
- **Career Opportunities:** Computer Operator, Office Assistant, Data Entry Officer
- **Certification:** Institute Diploma on completion; course content aligned to Microsoft Office standards
- **FAQ:** *"Is this course enough to get an office job with no experience?"* — Yes, this is designed as a complete, job-ready package; your portfolio project (an Office Records System) is something you can show at interviews. *"How long are the classes each day?"* — Ask your counselor for the current timetable; batches run mornings and days.
- **CTA:** Get Your Batch Timing & Enrollment Details →

#### 2. Modern Frontend Engineering
- **SEO Title:** Frontend Web Development Course (React & Next.js) in Nepal | DarbarTech
- **SEO Description:** Learn React, Next.js, and Tailwind CSS hands-on in 16 weeks. Build a real portfolio, get Meta-aligned certification, and start your frontend developer career.
- **Overview:** A 16-week, project-driven course for anyone who wants to build modern, responsive websites and interfaces — not just follow tutorials. You'll use the same tools and AI-assisted workflows professional frontend teams use today.
- **Learning Objectives:** Build responsive UIs with HTML/CSS/JS · Develop with React and Next.js · Style efficiently with Tailwind CSS · Use AI pair-programming tools productively · Ship three portfolio-ready websites
- **Skills Covered:** HTML/CSS/JS, React & Next.js, Tailwind CSS, AI-assisted coding, responsive design
- **Prerequisites:** Basic computer literacy; no prior coding required
- **Target Audience:** Bachelor's students, career-switchers, job seekers
- **Career Opportunities:** Frontend Developer, React Developer, UI Engineer
- **Certification:** Professional Certificate; curriculum aligned with Meta front-end development standards
- **FAQ:** *"Do I need to know how to code first?"* — No, the course starts from HTML/CSS fundamentals. *"Will I have real projects to show employers?"* — Yes — a restaurant website, an ecommerce frontend, and a school website are built during the course.
- **CTA:** Reserve Your Seat in the Next Cohort →

#### 3. MERN Full Stack Engineering
- **SEO Title:** MERN Full Stack Development Course in Kathmandu | DarbarTech
- **SEO Description:** Become a complete full-stack developer in 24 weeks. MongoDB, Express, React, Node — build and deploy real production apps with internship support.
- **Overview:** DarbarTech's most comprehensive web development track. Over 24 weeks, you go from database design to a deployed, production-style application — the kind of project that anchors a strong developer portfolio.
- **Learning Objectives:** Design REST APIs with Node.js/Express · Work with MongoDB and MySQL · Implement authentication and JWT · Deploy applications with Docker and CI/CD basics · Ship an ecommerce platform, job portal, or social app
- **Skills Covered:** Node.js, Express, MongoDB, React, Docker, GitHub, deployment/CI-CD
- **Prerequisites:** Basic programming logic (covered in Software Development Foundation, if needed)
- **Target Audience:** Bachelor's students, job seekers targeting full-stack roles
- **Career Opportunities:** Full Stack Developer, MERN Developer, Software Engineer
- **Certification:** Diploma; curriculum aligned with Meta full-stack standards; internship placement available
- **FAQ:** *"Is an internship guaranteed?"* — Internship opportunities are available and supported, subject to seat and partner availability — confirm current placement terms with a counselor. *"What's the class size?"* — Cohort-based, limited seats, so ask early about the next intake.
- **CTA:** Check Seats for the Next Cohort →

#### 4. Prompt Engineering Masterclass
- **SEO Title:** Prompt Engineering Course in Nepal (ChatGPT, Claude, Gemini) | DarbarTech
- **SEO Description:** A 3-week hands-on course to master ChatGPT, Claude, and Gemini for work — smarter prompting, AI content, and automation for professionals and freelancers.
- **Overview:** The fastest-growing skill gap in Nepal's job market right now isn't coding — it's knowing how to actually get useful output from AI tools. This short, practical course turns casual ChatGPT users into people who save hours every week.
- **Learning Objectives:** Write structured, reusable prompts · Compare ChatGPT, Claude, and Gemini for different tasks · Use AI for content, image, and basic video generation · Build a personal prompt library for repeat use
- **Skills Covered:** Prompt engineering, multi-model AI workflows, AI content generation, AI image/video tools
- **Prerequisites:** Basic computer and internet use
- **Target Audience:** Working professionals, business owners, freelancers
- **Career Opportunities:** AI Consultant, Content Strategist, freelance AI-assisted services
- **Certification:** Institute Certificate
- **FAQ:** *"Do I need to know coding?"* — No, this is a no-code course focused on getting results from existing AI tools. *"Is this useful if I already use ChatGPT casually?"* — Yes — most students already use AI tools; this course is about using them 5–10x more effectively.
- **CTA:** Join the Next 3-Week Batch →

#### 5. Advanced AI Software Engineering Diploma
- **SEO Title:** AI Software Engineering Diploma (1-Year Program) Nepal | DarbarTech
- **SEO Description:** DarbarTech's flagship 48-week diploma: full-stack development, LLM integration, and cloud deployment. Build a capstone AI product with internship support.
- **Overview:** A one-year, career-defining diploma for students who want to graduate with more than a certificate — a working, deployed AI-integrated software product they built themselves, plus the full-stack and cloud fundamentals to keep building after graduation.
- **Learning Objectives:** Build full-stack applications end-to-end · Integrate LLMs into real products · Deploy on cloud infrastructure (AWS) · Apply DevOps fundamentals · Complete a capstone AI product from scratch
- **Skills Covered:** Full stack development, LLM integration, cloud deployment, DevOps basics, capstone project management
- **Prerequisites:** Comfort with computers; prior programming exposure helpful but not mandatory — foundational modules are included
- **Target Audience:** Bachelor's students and job seekers committed to a serious, career-track program
- **Career Opportunities:** AI Software Engineer, Full Stack Developer, Product Engineer
- **Certification:** Advanced Diploma; curriculum aligned with Microsoft and Google standards; internship placement available
- **FAQ:** *"Is this suitable for someone with zero coding background?"* — Foundational programming is covered early in the 48 weeks, but expect a demanding pace — talk to a counselor about your starting point. *"What does the capstone project look like?"* — A full-stack SaaS-style application with real AI integration, built individually or in a small team.
- **CTA:** Apply for the Next Intake →

#### 6. Creative Graphic Design Masterclass
- **SEO Title:** Graphic Design Course in Kathmandu (Photoshop, Illustrator, AI Tools) | DarbarTech
- **SEO Description:** Learn Photoshop, Illustrator, and AI design tools in 12 weeks. Build a real portfolio — logos, branding, social media — with Adobe-aligned certification.
- **Overview:** For anyone whose creativity has outgrown Canva templates, this course builds real design fluency — the software skills, the branding logic, and the portfolio pieces employers and clients actually ask to see.
- **Learning Objectives:** Design in Photoshop and Illustrator confidently · Use Canva AI and Figma for faster workflows · Apply branding and print-design principles · Produce a client-ready design portfolio
- **Skills Covered:** Photoshop, Illustrator, Canva, Figma, branding design, print design
- **Prerequisites:** None — beginner-friendly, some creative interest helpful
- **Target Audience:** +2 students, freelancers, job seekers
- **Career Opportunities:** Graphic Designer, Social Media Designer, Branding Designer, freelance design work
- **Certification:** Professional Certificate; curriculum aligned with Adobe standards
- **FAQ:** *"Do I need my own laptop or design software?"* — Lab computers with licensed software are available in class; ask about take-home practice options. *"What will be in my portfolio by the end?"* — A logo, business card, brochure, and a full social media campaign.
- **CTA:** See the Full Design Curriculum →

#### 7. Digital Marketing Pro
- **SEO Title:** Digital Marketing Course in Nepal (SEO, Google & Meta Ads) | DarbarTech
- **SEO Description:** Learn SEO, paid ads, and AI-powered content strategy in 8 weeks. Launch a real ad campaign and SEO audit — practical training for business owners and job seekers.
- **Overview:** Built for people who need marketing that produces measurable results, not just theory — SEO fundamentals, running real ad campaigns on Google and Meta, and using AI tools to produce content faster without losing quality.
- **Learning Objectives:** Run an SEO audit and fix core issues · Launch and manage Google and Meta ad campaigns · Use AI tools for ad copy and content · Read and act on social media analytics
- **Skills Covered:** SEO & SEM, Google & Meta Ads, AI ad copy, social media analytics
- **Prerequisites:** Basic computer and internet use
- **Target Audience:** Business owners, freelancers, job seekers
- **Career Opportunities:** Digital Marketer, SEO Specialist, Social Media Manager
- **Certification:** Professional Certificate; curriculum aligned with Google and Meta advertising standards
- **FAQ:** *"I run a small business — is this course practical for me directly?"* — Yes, the SEO audit and ad-campaign projects are built to be run on your own business or a real practice business. *"Do I need an advertising budget during the course?"* — Ask your counselor about practice-account options if you'd rather not spend on ads during training.
- **CTA:** Start Growing a Real Campaign →

#### 8. Professional Computer Diploma
- **SEO Title:** Computer Diploma Course in Kathmandu (6-Month Program) | DarbarTech
- **SEO Description:** A complete 24-week diploma covering computer fundamentals, MS Office, and IT support basics — one program from zero to job-ready.
- **Overview:** For students who want one structured program that takes them from complete beginner to job-ready across computer fundamentals, Office software, and basic IT support — without having to plan a sequence of separate short courses.
- **Learning Objectives:** Operate confidently across OS, internet, and Office software · Type accurately at a professional standard · Handle basic IT support scenarios · Build an IT support and office-skills portfolio
- **Skills Covered:** Computer fundamentals, typing, Office suite, internet, IT support basics
- **Prerequisites:** None
- **Target Audience:** SEE graduates, +2 students, job seekers
- **Career Opportunities:** Computer Operator, IT Support Assistant, Office Executive
- **Certification:** Diploma; curriculum aligned with Microsoft Office standards
- **FAQ:** *"How is this different from the shorter Computer Operator course?"* — This diploma runs longer (24 weeks vs. 12) and adds IT support fundamentals on top of typing and Office skills. *"Can I pay in installments?"* — Yes, flexible installment plans are available — ask your counselor for current terms.
- **CTA:** Start Your 6-Month Diploma →

---

### Courses — Condensed Content Table (Remaining 29 Courses)

*Use the 8 flagship write-ups above as your voice/structure template. This table gives your writer the SEO title, one-line meta description, and CTA for each remaining course so nothing launches half-finished.*

| Course | SEO Title | Meta Description | CTA |
|---|---|---|---|
| Digital Literacy Essentials | Digital Literacy Course for Beginners in Nepal \| DarbarTech | Learn everyday computer, internet, and AI skills in 4 weeks — built for absolute beginners. | Start Your First Computer Course → |
| Speed Typing Mastery | Speed Typing Course in Kathmandu (English & Nepali) \| DarbarTech | Type faster and more accurately with certified speed tests — job and exam ready in 4 weeks. | Book a Typing Assessment → |
| Microsoft Office Professional | MS Office Course in Nepal (Word, Excel, PowerPoint) \| DarbarTech | Master the Office suite every workplace uses, plus Copilot AI basics, in 8 weeks. | Enroll in the Next Office Batch → |
| Advanced Excel for Professionals | Advanced Excel Course in Kathmandu (Dashboards & Power Query) \| DarbarTech | Build real business dashboards with pivot tables, Power Query, and automation in 4 weeks. | Level Up Your Excel Skills → |
| AI Office Administration | AI Office Administration Course in Nepal \| DarbarTech | Run any office more efficiently with AI-assisted scheduling, drafting, and workflow tools. | Modernize Your Office Skills → |
| Software Development Foundation | Beginner Programming Course (C, Python, Java) in Nepal \| DarbarTech | Build real coding logic in C, Python, and Java — the foundation every developer starts with. | Start Coding From Scratch → |
| DSA & Competitive Programming | Data Structures & Algorithms Course in Kathmandu \| DarbarTech | Sharpen your problem-solving for coding interviews and contests in 8 weeks. | Prepare for Coding Interviews → |
| Python for AI Engineering | Python for AI Course in Nepal \| DarbarTech | Learn Python and practical AI integration to build smart, automated applications. | Build Your First AI App → |
| Backend Engineering (Node & Laravel) | Backend Development Course (Node.js & Laravel) Nepal \| DarbarTech | Design secure, scalable backend systems and APIs in 16 weeks of hands-on training. | Build Real Backend Systems → |
| Next.js & WordPress Development | Next.js & WordPress Course in Kathmandu \| DarbarTech | Build fast marketing sites and client websites, ready to deploy and sell, in 8 weeks. | Start Building Client Websites → |
| Mobile App Development | Flutter & React Native Course in Nepal \| DarbarTech | Launch real Android and iOS apps with one codebase using Flutter and React Native. | Launch Your First Mobile App → |
| Agentic AI & Automation | AI Automation Course in Nepal (LLM Agents) \| DarbarTech | Build real AI-powered agents and automation pipelines with modern LLM APIs. | Build Your First AI Agent → |
| LLM & RAG Systems Development | LLM & RAG Development Course in Kathmandu \| DarbarTech | Design and deploy retrieval-augmented and agentic LLM systems using modern frameworks. | Build Production-Grade AI Systems → |
| Machine Learning & Deep Learning | Machine Learning Course in Nepal (PyTorch & TensorFlow) \| DarbarTech | Build and evaluate ML and deep learning models with Python, PyTorch, and TensorFlow. | Start Your ML Portfolio → |
| Data Analytics with Power BI | Power BI & Data Analytics Course in Kathmandu \| DarbarTech | Turn raw business data into dashboards and insights using SQL and Power BI. | Turn Data Into Decisions → |
| Data Engineering with SQL & Big Data | Data Engineering Course in Nepal (SQL & Spark) \| DarbarTech | Design ETL pipelines and big data infrastructure behind modern analytics and AI. | Build Your First Data Pipeline → |
| Cloud & DevOps Engineering | AWS & DevOps Course in Kathmandu \| DarbarTech | Deploy, containerize, and automate applications on AWS and Azure like a modern tech team. | Start Deploying Like a Pro → |
| Brand Identity & Packaging Design | Brand & Packaging Design Course in Nepal \| DarbarTech | Build complete brand identities and packaging designs used by real product companies. | Design Your First Brand Kit → |
| UI/UX Design Pro | UI/UX Design Course in Kathmandu (Figma) \| DarbarTech | Design user-friendly apps and websites in Figma, from wireframes to tested prototypes. | Start Your UX Portfolio → |
| Video Editing & Motion Graphics | Video Editing Course in Nepal (Premiere Pro, After Effects) \| DarbarTech | Edit professional videos and motion graphics for YouTube, Reels, and business use. | Start Editing Like a Pro → |
| Professional Accounting Package | Tally & Accounting Course in Kathmandu \| DarbarTech | Manage bookkeeping, billing, and GST-ready accounts with Tally Prime and Excel. | Get Job-Ready in Accounting → |
| Network Engineering with CCNA | CCNA Networking Course in Nepal \| DarbarTech | Build job-ready networking skills with CCNA and MikroTik training. | Start Your Networking Career → |
| Ethical Hacking & Cyber Security | Ethical Hacking Course in Kathmandu \| DarbarTech | Learn cybersecurity defense through hands-on penetration testing labs. | Start Thinking Like an Attacker → |
| Cyber Security Professional (CEH & SOC) | CEH & SOC Analyst Training in Nepal \| DarbarTech | Prepare for CEH-style certification and real SOC analyst work with hands-on labs. | Prepare for a SOC Career → |
| Advanced Growth Marketing & Automation | Growth Marketing Course in Kathmandu \| DarbarTech | Master multi-channel ads, analytics, and marketing automation beyond the basics. | Scale Your Marketing Skills → |
| Freelancing & Online Earning | Freelancing Course in Nepal (Fiverr & Upwork) \| DarbarTech | Learn to find clients, build a portfolio, and win freelance projects with confidence. | Start Earning Online → |
| AutoCAD Design Professional | AutoCAD Course in Kathmandu \| DarbarTech | Learn professional 2D and 3D drafting used across civil and architecture projects. | Start Drafting Real Projects → |
| Kids Coding & Robotics | Kids Coding & Robotics Course in Nepal \| DarbarTech | A fun, guided introduction to coding, robotics, and safe AI use for ages 8–15. | Enroll Your Child Today → |
| Career Track: AI Automation Specialist | AI Automation Specialist Career Track Nepal \| DarbarTech | Become an in-demand AI automation specialist with a job-ready automation portfolio. | Start Your AI Career Track → |

---

### Programs & Institutional Services *(replacing "Services" — mapped to your actual business model)*

Since DarbarTech's core business is course delivery rather than a separate consulting arm, I've built this section around your real, sellable institutional offerings:

**1. School & College Batch Partnerships**
- **Benefits:** Structured digital-literacy and career-readiness training delivered on your students' schedule
- **Process:** Consultation → curriculum mapping to school calendar → dedicated batch → joint certification
- **Deliverables:** Attendance and completion reports, student certificates, optional parent-facing progress updates
- **Industries served:** Secondary schools, +2 colleges
- **FAQ:** *"Can training happen on our campus?"* — Ask about on-site vs. in-lab options.
- **CTA:** Discuss a School Partnership →

**2. Corporate & Team Upskilling**
- **Benefits:** Office staff trained on Office/AI tools, or technical teams upskilled in specific software, without disrupting daily operations
- **Process:** Skills-gap consultation → custom batch schedule (evenings/weekends) → completion certificates
- **Deliverables:** Group certificates, skills assessment summary
- **Industries served:** SMEs, retail/service businesses, NGOs
- **FAQ:** *"Can this be customized to our software stack?"* — Discuss your specific tools during the consultation.
- **CTA:** Request a Corporate Training Quote →

**3. Internship & Career Placement Support**
- **Benefits:** Portfolio review, resume building, interview preparation, and introductions through the DarbarTech employer network for career-track graduates
- **Process:** Available to eligible graduates on career-track/diploma programs — ask your counselor which courses include internship support
- **Deliverables:** Polished portfolio, resume, mock interview feedback
- **CTA:** Ask About Career Support →

---

### Blog

**Existing content foundation (already drafted, needs de-placeholdering and, for the Rina story, real consent or a clear "illustrative example" disclosure):**
- *5 Reasons to Learn Web Development in 2026*
- *Graphic Design Career in Nepal: Salary, Scope, and How to Start*
- *How MS Office Skills Can Still Get You Hired in 2026*
- *Python vs JavaScript: Which Should You Learn First in 2026?*
- *From Zero to Freelance: How Rina Earned Rs. 40,000/Month After 3 Months* — **flag: verify real consent or rewrite as a composite/illustrative example, clearly labeled as such**

**Blog Categories:**
- Career Guidance (salary/scope guides per field)
- Course Comparisons (X vs. Y decision guides)
- Success Stories (real, consented graduate stories only)
- Industry Trends (AI tools, job market shifts)
- Study Tips & Study-at-Institute Guides

**Suggested Pillar Pages** (long-form, comprehensive, link-magnet content):
1. "The Complete Guide to Choosing a Computer Course in Nepal" — links out to every course category
2. "Tech Careers in Nepal 2026: Salary & Scope Guide" — links to career-specific posts and courses
3. "AI Skills for Every Career: A Nepal-Focused Guide" — links to Prompt Engineering, AI Automation, LLM courses

**Content Clusters (pillar → supporting posts):**
- *Web Development cluster:* "5 Reasons to Learn Web Development" → "Python vs JavaScript" → "Frontend vs Backend: Which Should You Learn First?" (new) → course pages for Frontend, Backend, MERN
- *Career-change cluster:* "MS Office Skills Still Matter" → "Freelancing in Nepal: Getting Your First Client" (new) → "Graphic Design Career in Nepal" → relevant course pages
- *AI cluster:* "What Is Prompt Engineering and Why Does It Matter?" (new) → "AI Tools Every Nepali Small Business Should Use" (new) → AI course pages

**Evergreen Content Ideas:**
- "SEE/+2 Graduate? Here's How to Choose Your First Tech Course"
- "How Much Does It Cost to Learn to Code in Nepal?" (framed around value, not a price list)
- "CCNA vs. Networking Basics: What's the Real Difference?"
- "Is a Computer Diploma Worth It in 2026?"

---

### Contact

**Professional Contact Introduction:** Have a question about a course, a batch schedule, or which program fits your goals? Our counselors respond quickly and never pressure you to enroll before you're ready.

**Office Description:** *(Fill in once your address/lab photos are finalized)* DarbarTech's Kathmandu campus includes dedicated computer labs, a hardware/networking lab, and a quiet counseling room for one-on-one guidance — drop by during our listed hours or book a specific time.

**Consultation CTA:** Book a Free Course Consultation →

**Contact Form Helper Text:** Tell us a bit about your goal (a job, a promotion, a business, or just curiosity) and we'll recommend the right course and batch — no pressure, no obligation.

**FAQ (contact-page specific):**
- *"How fast will I get a reply?"* — State your real SLA (e.g., "within one business day") once confirmed internally.
- *"Can I visit without booking first?"* — State your real walk-in policy.

---

### Footer

**Company Summary:** DarbarTech Group of Technology is a Kathmandu-based computer training institute offering 37 hands-on courses across 15 career fields — from beginner computer literacy to advanced AI software engineering — with certified trainers, real lab time, and career support.

**Quick Links:** Home · Courses · About · Blog · Gallery · Events · Contact

**Courses (footer mega-list, grouped by category):** Basic Computer · Office & Productivity · Programming · Web Development · AI & Automation · Data Science · Cloud & DevOps · Graphic Design · Video Production · Business & Accounting · Networking · Cyber Security · Digital Marketing · Career Programs · Professional Diploma

**Contact Information:** *(Populate from confirmed real details — phone, WhatsApp, email `info@darbarcomputer.edu.np`, full street address, and operating hours already defined in `institute.ts`: Sun–Fri 7 AM–8 PM, Sat 8 AM–6 PM)*

**Copyright:** © 2026 DarbarTech Group of Technology. All rights reserved.

**Legal Notice:** *(Have this reviewed by a Nepal-qualified advisor before publishing)* — Course durations, certifications, and career outcomes described on this site reflect DarbarTech's training programs and are not guarantees of employment. Certification and industry-partnership claims are accurate only where explicitly verified; contact us for current certification details.

---

## SEO Metadata (Representative Set)

| Page | SEO Title | Meta Description | Slug | Focus Keyword |
|---|---|---|---|---|
| Home | Computer Training Institute in Kathmandu — 37 Courses \| DarbarTech | Programming, web development, AI, design, networking & more. Certified trainers, small batches, real projects. Book a free consultation. | `/` | computer training institute Kathmandu |
| Courses (hub) | All Courses — Programming, Design, AI & More \| DarbarTech | Browse 37 hands-on computer courses across 15 career fields in Kathmandu. Flexible batches, installment plans, career support. | `/courses` | computer courses in Nepal |
| About | About DarbarTech — Kathmandu's Hands-On Tech Institute | Learn about DarbarTech's mission, training philosophy, and team behind Nepal's practical, career-focused computer courses. | `/about` | Darbar Computer institute Kathmandu |
| Blog | Career & Tech Guides for Nepal \| DarbarTech Blog | Career guidance, course comparisons, and success stories to help you choose and grow your tech career in Nepal. | `/blog` | tech career blog Nepal |
| Contact | Contact DarbarTech — Book a Free Course Consultation | Questions about courses or batches? Contact DarbarTech's Kathmandu campus or book a free, no-obligation consultation. | `/contact` | contact computer institute Kathmandu |
| FAQ | Frequently Asked Questions \| DarbarTech | Answers on admissions, fees, installments, certification, and batch scheduling at DarbarTech Kathmandu. | `/faq` | DarbarTech FAQ |

*(Open Graph / Twitter fields should mirror the SEO Title/Description above with a 1200×630 campus or classroom image — see Image SEO section.)*

---

## Keyword Strategy

**Primary Keywords:** computer training institute Kathmandu · computer courses in Nepal · Darbar Computer · DarbarTech

**Secondary Keywords:** web development course Nepal · graphic design course Kathmandu · digital marketing course Nepal · CCNA networking course Nepal · AI course Kathmandu · MS Office course Nepal

**Long-Tail Keywords:** "best computer institute in Kathmandu for beginners" · "web development course for SEE graduates Nepal" · "AI software engineering diploma Nepal" · "typing course with certificate Kathmandu"

**LSI / Semantic Keywords:** hands-on training, certified trainers, job-ready skills, career support, internship, portfolio project, small batch classes, installment plan

**Question-Based Keywords:** "which computer course should I learn first in Nepal?" · "is graphic design a good career in Nepal?" · "how long does it take to learn web development?" · "is MS Office still useful in 2026?"

**Local SEO Keywords:** computer institute near [your neighborhood], Kathmandu · IT training center Kathmandu · CCNA training Kathmandu · Tally training Kathmandu

---

## Internal Linking Strategy

- Every **course page** links to 2–3 related courses in the same category (`getRelatedCourses` is already implemented in the codebase — make sure it renders as visible link cards, not just data)
- Every **blog post** links to the 1–2 course pages it's most relevant to (e.g., "Python vs JavaScript" → Software Development Foundation + Python for AI Engineering)
- **Category pages/filters** (Programming, Web Development, AI & Automation, etc.) should each get their own indexable URL with a short intro paragraph — this is currently likely a client-side filter (`CoursesClient.tsx`); confirm each category has a crawlable, linkable state
- **Homepage → flagship courses → About/Contact** forms the primary conversion funnel; keep this path to 2 clicks maximum
- **FAQ page** answers should link out to the specific course or contact page they resolve to, not just sit in isolation

---

## Structured Data Recommendations

Your codebase (`src/lib/seo.ts`) **already implements** `orgJsonLd`, `courseJsonLd`, `blogPostJsonLd`, and `faqJsonLd` — this is genuinely ahead of most small-institute sites. Recommendations to complete it:

- **Organization/EducationalOrganization Schema** — already present; add `sameAs` array with real social profile URLs once confirmed
- **LocalBusiness Schema** — add once you have a confirmed physical address and geo-coordinates (currently placeholder in `institute.ts`)
- **Course Schema** — already implemented per course; **remove any `offers`/price fields if you proceed with no visible pricing**, since Course schema with a fake or missing price can trigger Google Search Console rich-result errors
- **FAQ Schema** — already implemented; ensure it only fires on pages where FAQs are visibly rendered (Google penalizes FAQ schema that doesn't match on-page content)
- **BreadcrumbList Schema** — not yet seen in the codebase; add for `/courses/[slug]` and `/blog/[slug]` to strengthen rich-snippet eligibility
- **WebSite Schema** with `SearchAction` — add to `layout.tsx` to enable a sitelinks search box
- **Article Schema** — already present for blog via `blogPostJsonLd`; confirm `datePublished`/`dateModified` are both wired, not just one
- **Person Schema** — add once real trainer names/bios/photos replace the team placeholders

---

## Image SEO Recommendations

Current state: most images are generic Pexels stock photos. This is fine as a placeholder but hurts E-E-A-T (Google's Helpful Content guidance rewards real, original imagery for local service businesses).

| Image type | Suggested filename | ALT text pattern | Notes |
|---|---|---|---|
| Course card image | `course-[slug]-darbartech.jpg` | "[Course title] hands-on training at DarbarTech Kathmandu" | Replace stock category photos with real classroom/lab photos where possible |
| Team photo | `trainer-[name]-darbartech.jpg` | "[Name], [Role] at DarbarTech" | Real photos only — remove stock portraits |
| Gallery images | `gallery-[category]-[n]-darbartech.jpg` | "[Category] at DarbarTech computer training institute" | Already categorized in `institute.ts`; just needs real photos |
| Blog cover | `blog-[slug]-cover.jpg` | Matches post title, description-style ALT | Currently reusing generic stock across multiple posts — assign unique images per post |
| OG/Twitter image | `darbartech-og-default.jpg` | N/A (OG meta) | Build one branded 1200×630 default; override per flagship course/blog post |

---

## CTA Strategy

- **Homepage:** dual CTA (Explore Courses / Free Consultation) — keep both above the fold
- **Course pages:** single primary CTA, phrased as *outcome-first* ("Get Your Batch Timing & Enrollment Details") rather than generic "Enroll Now" — this performs better with a no-visible-pricing layout because it promises the visitor will get the missing information (fee, schedule) by taking the action
- **Blog posts:** end every post with a contextual CTA to the most relevant course, not a generic "Contact Us"
- **Exit-intent / sticky mobile CTA:** "Get Free Course Guidance" — low-commitment phrasing converts better than "Enroll" for cold blog/organic traffic

---

## Conversion Optimization Suggestions

**Testimonials — do this before launch, not after:**
1. Identify 6–10 real, recent graduates willing to give a written or video testimonial
2. Get explicit written consent (name/photo usage) — a simple one-line consent form is enough
3. Ask a specific question ("What's one thing you can now do that you couldn't before this course?") rather than "Any feedback?" — specific answers convert better than generic praise
4. Until real testimonials are collected, **remove the testimonial section entirely** rather than publish fabricated "Sample Student" quotes — fake reviews are both an ethical and a legal risk (Nepal's Consumer Protection Act and most ad-platform policies prohibit fabricated endorsements)

**Trust signals to add once verified:** real certification-body relationships (logo use requires permission), real years-in-operation, real student count, real employer names for internship partners (with their permission)

**Success metrics:** replace "98% certification rate" with something you can prove — e.g., number of course completions this year, number of portfolio projects built, number of batches run

---

## Technical SEO Recommendations

- Confirm `app/sitemap.ts` and `app/robots.ts` (both present in the codebase) include every course, blog, and event slug dynamically, not just static pages
- Add `dateModified` to blog/course JSON-LD whenever content is meaningfully updated
- Ensure category filtering on `/courses` produces crawlable URLs (e.g., `/courses?category=web-development` with proper canonical handling, or dedicated `/courses/category/[slug]` routes) rather than client-only filtering with no unique URL
- Compress and serve all images via Next.js `<Image>` (already used in `app/page.tsx`) with explicit `sizes` — continue this pattern across all pages
- Add `hreflang`/locale tags only if you plan a Nepali-language version; otherwise keep `locale: "en"` as-is
- Set real environment variables (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_ADDRESS`) before launch — several SEO/schema fields silently fall back to placeholder text if these are unset

---

## Content Improvement Checklist

- [ ] Replace all `[PLACEHOLDER]` values in `institute.ts` (story, team, phone, address, map embed)
- [ ] Replace or remove the "Government-Recognized Certification" claim unless verified
- [ ] Verify or reword every `industryCertification` badge (Microsoft, Google, Meta, Adobe, Cisco, AWS, Autodesk)
- [ ] Replace all 6 placeholder testimonials with real, consented reviews — or remove the section
- [ ] Resolve all 3 flagged FAQ answers with confirmed institute policy (batch swaps, refunds, certification claims)
- [ ] Rewrite or clearly disclose the "Rina" success story in the blog
- [ ] Decide on final pricing-display strategy (fully hidden vs. installment-badge-only, per the recommendation above) and apply consistently across all 37 course pages
- [ ] Write full content packages for the remaining 29 courses using the flagship template
- [ ] Add real trainer photos/bios to replace stock portraits
- [ ] Set all `NEXT_PUBLIC_*` environment variables before launch
- [ ] Add BreadcrumbList and WebSite schema
- [ ] Confirm category-filtered course URLs are crawlable

---

## Future Content Roadmap

**Phase 1 (Launch-ready):** Complete flagship course content, homepage/about/contact/footer copy, real testimonials, verified stats — all covered above.

**Phase 2 (Month 2–3):** Full content for remaining 29 courses; 3–4 new blog posts per pillar cluster; real trainer bios and photography.

**Phase 3 (Month 4–6):** Dedicated category landing pages for each of the 15 course categories (currently only a filter — each deserves its own SEO-optimized page with unique intro copy); a "Corporate Training" landing page if you pursue B2B; a Nepali-language version of top-converting pages if data shows demand.

**Phase 4 (Ongoing):** Quarterly refresh of "salary and scope" blog content (these depreciate fastest), annual refresh of statistics/achievements, continuous testimonial collection after every graduating batch.
