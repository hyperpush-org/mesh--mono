import Link from "next/link"

const footerLinks = {
  Product: [
    { name: "Features", href: "/#features" },
    { name: "Workflow", href: "/#workflow" },
    { name: "Pricing", href: "/#pricing" },
  ],
  Developers: [
    { name: "Documentation", href: "/docs" },
    { name: "Mesh runtime", href: "/mesh" },
  ],
  Legal: [
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
    { name: "License", href: "/license" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-10 grid grid-cols-2 gap-6 sm:mb-12 sm:grid-cols-3 sm:gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <Link href="/" className="mb-4 flex items-center">
              <img src="/logo-light.svg" alt="hyperpush" className="h-7" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              Production error tracking with clear ownership, release context, and fast recovery.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="mb-4 text-sm font-semibold">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} hyperpush. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
