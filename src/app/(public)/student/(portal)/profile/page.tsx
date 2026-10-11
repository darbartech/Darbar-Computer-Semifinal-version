import { AvatarUploader } from "@/components/common/AvatarUploader";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "@/components/student/ProfileForm";
import { uploadStudentPhotoAction } from "@/server/actions/student";
import { requireStudentProfile } from "@/server/student-session";

export default async function StudentProfilePage() {
  const { profile } = await requireStudentProfile();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Your profile</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Keep your details up to date. Fields marked private are never shown publicly.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-neutral-900">Profile picture</h3>
            <p className="text-sm text-neutral-600 mt-0.5">
              Used in your account menu and on your public portfolio.
            </p>
          </div>
          <AvatarUploader
            displayName={profile.name}
            photoUrl={profile.photoUrl}
            uploadAction={uploadStudentPhotoAction}
          />
        </CardContent>
      </Card>

      <ProfileForm profile={profile} />
    </div>
  );
}
