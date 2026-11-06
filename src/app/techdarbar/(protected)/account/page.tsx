import type { Metadata } from "next";
import { UserCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { AvatarUploader } from "@/components/common/AvatarUploader";
import { TwoFactorCard } from "@/components/admin/TwoFactorCard";
import { Card, CardContent } from "@/components/ui/card";
import { uploadOwnAvatarAction } from "@/server/actions/account";
import {
  needsTwoFactorSetup,
  offersTwoFactorSetup,
  requireSessionUser,
  requiresTwoFactor,
} from "@/server/session";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false, follow: false },
};

export default async function AdminAccountPage() {
  // Deliberately the ungated primitive (fix guide §4): this is the one screen a
  // staff account reaches before it has a second factor, so gating it here would
  // send the enrolment page into a redirect loop.
  const user = await requireSessionUser();
  const setupRequired = needsTwoFactorSetup(user.role, user.twoFactorEnabled);
  // Money and certificates demand a second factor; the rest of the staff roles
  // (COUNSELOR, INSTRUCTOR, EDITOR) may add one by choice (task 2).
  const canManageTwoFactor = offersTwoFactorSetup(user.role);

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

      {canManageTwoFactor && (
        <TwoFactorCard
          enabled={user.twoFactorEnabled}
          setupRequired={setupRequired}
          requiredForRole={requiresTwoFactor(user.role)}
        />
      )}

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
