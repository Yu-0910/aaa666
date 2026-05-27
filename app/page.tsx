import { redirect } from "next/navigation"

/** サイトホームは 2026 トップ（`SITE_TOP_HREF` と一致） */
export default function Page() {
  redirect("/2026")
}
