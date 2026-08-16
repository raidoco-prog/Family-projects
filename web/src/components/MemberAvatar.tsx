import { initial } from "@/lib/palette";
import type { Member } from "@/lib/types";

const SIZES = {
  xs: "size-[19px] text-[0.6rem]",
  sm: "size-[23px] text-[0.68rem]",
  md: "size-[30px] text-[0.78rem]",
  lg: "size-10 text-sm",
} as const;

export default function MemberAvatar({
  member,
  size = "sm",
  dim = false,
}: {
  member: Pick<Member, "display_name" | "color">;
  size?: keyof typeof SIZES;
  dim?: boolean;
}) {
  return (
    <span
      style={{ background: member.color }}
      title={member.display_name}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-on-pastel ${
        SIZES[size]
      } ${dim ? "opacity-45" : ""}`}
    >
      {initial(member.display_name)}
    </span>
  );
}
