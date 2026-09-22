import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Building2,
  Truck,
  Cylinder,
  Gauge,
  Wrench,
  FileSpreadsheet,
  Settings,
  LogOut,
  Menu,
  X,
  FlaskConical,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NAV, AUTH } from "@/constants/testIds";

const modules = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { id: "obras", label: "Obras", icon: Building2, path: "/obras" },
  { id: "concreto", label: "Concreto", icon: Truck, path: "/concreto" },
  { id: "cps", label: "Corpos de Prova", icon: Cylinder, path: "/corpos-de-prova" },
  { id: "ruptura", label: "Ruptura", icon: Gauge, path: "/ruptura" },
  { id: "solos", label: "Solos", icon: Layers, path: "/solos" },
  { id: "equipamentos", label: "Equipamentos", icon: Wrench, path: "/equipamentos" },
  { id: "relatorios", label: "Relatórios", icon: FileSpreadsheet, path: "/relatorios" },
  { id: "configuracoes", label: "Configurações", icon: Settings, path: "/configuracoes" },
];

function SidebarContent({ onNavigate }) {
  return (
    <>
      <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-sky-400" />
        </div>
        <div className="font-display font-bold text-white text-lg tracking-tight">
          LabControl
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 sidebar-dark">
        {modules.map((m) => (
          <NavLink
            key={m.id}
            to={m.path}
            onClick={onNavigate}
            data-testid={NAV.link(m.id)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-slate-800 text-sky-400 font-medium"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
              }`
            }
          >
            <m.icon className="w-4 h-4 flex-shrink-0" />
            <span>{m.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-3 border-t border-slate-800 text-[11px] text-slate-500">
        Versão 1.0.0
      </div>
    </>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const initials = (user?.name || "US")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        data-testid={NAV.sidebar}
        className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-slate-900 flex-col z-40"
      >
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-slate-900 flex flex-col">
            <button
              className="absolute right-3 top-3 text-slate-400"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-8 sticky top-0 z-30">
          <button
            className="lg:hidden mr-3 p-2 text-slate-600"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="text-xs text-slate-500">{user?.company_name || "LabControl"}</div>
            <div className="text-sm font-semibold text-slate-800 hidden sm:block">
              {location.pathname.replace("/", "").replace("-", " ").toUpperCase() || "DASHBOARD"}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 h-10">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-sky-100 text-sky-700 text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-medium text-slate-800 leading-none">
                    {user?.name}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-none mt-1 capitalize">
                    {user?.role?.replace("_", " ")}
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid={AUTH.logoutBtn}
                onClick={logout}
                className="text-red-600"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 page-fade">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        data-testid={NAV.mobileBottom}
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-800 flex justify-around items-center z-40"
      >
        {[modules[0], modules[1], modules[2], modules[4], modules[6]].map((m) => (
          <NavLink
            key={m.id}
            to={m.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[10px] ${
                isActive ? "text-sky-400" : "text-slate-400"
              }`
            }
          >
            <m.icon className="w-5 h-5" />
            <span>{m.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
