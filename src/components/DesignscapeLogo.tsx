/** Designscape logo (red, horizontal) at the top of the login cards. */
export default function DesignscapeLogo({ height = 56 }: { height?: number }) {
  return (
    <span className="ds-logo">
      <img src="/branding/designscape.png" width={Math.round((height * 506) / 168)} height={height} alt="Designscape" />
    </span>
  );
}
