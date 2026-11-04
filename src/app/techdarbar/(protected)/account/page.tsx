import type { Metadata } from "next";
import { UserCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { AvatarUploader } from "@/components/common/AvatarUploader";
import { Card, CardContent } from "@/components/ui/card";
import { uploadOwnAvatarAction } from "@/server/actions/account";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false },
};

export default async function AdminAccountPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/techdarbar" }, { label: "My account" }]} />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <UserCircle className="size-6 text-primary" />
          My account
        </h1>
        <p className="text-sm text-neutral-600">
          Your picture shows in the top bar and on anything that lists your name.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Profile picture</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              Signed in as {user.name} ({user.email}). Name, role and status are changed by a
              super administrator.
            </p>
          </div>

          <AvatarUploader
            displayName={user.name}
            photoUrl={user.image}
            uploadAction={uploadOwnAvatarAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
