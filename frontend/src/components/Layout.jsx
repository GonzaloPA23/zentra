import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, Package, Users, Building2,
  ChevronDown, ChevronRight, Menu, X, LogOut, User,
  Boxes, Tag, Warehouse, UserCheck, Activity, Layers,
  Bell, Truck
} from 'lucide-react';

const NAV = [
  {
    label: 'Dashboard',
    to: '/',
    icon: LayoutDashboard,
    roles: ['superadmin','admin','supervisor','almacenero'],
    exact: true,
  },
  {
    label: 'Módulo 1: Registros',
    to: '/registros',
    icon: ClipboardList,
    roles: ['superadmin','admin','supervisor','almacenero'],
  },
  {
    label: 'Módulo 2: Tránsito',
    to: '/transito-aprobaciones',
    icon: Truck,
    roles: ['superadmin','admin','supervisor'],
  },
  {
    label: 'Catálogos',
    icon: Package,
    roles: ['superadmin','admin'],
    children: [
      { label: 'Categorías',        to: '/catalogos/categorias',        icon: Tag },
      { label: 'Tipos Mercadería',  to: '/catalogos/tipos-mercaderia',  icon: Layers },
      { label: 'Almacenes',         to: '/catalogos/almacenes',         icon: Warehouse },
      { label: 'SKUs',              to: '/catalogos/skus',              icon: Boxes },
      { label: 'Personal Receptor', to: '/catalogos/personal-receptor', icon: UserCheck },
      { label: 'Indicadores',       to: '/catalogos/indicadores',       icon: Activity },
    ],
  },
  {
    label: 'Usuarios',
    to: '/usuarios',
    icon: Users,
    roles: ['superadmin','admin'],
  },
  {
    label: 'Empresas',
    to: '/empresas',
    icon: Building2,
    roles: ['superadmin'],
  },
];

function NavItem({ item, collapsed, onClick }) {
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);

  if (item.roles && !hasRole(...item.roles)) return null;

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="sidebar-link w-full sidebar-link-inactive"
        >
          <item.icon size={18} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </>
          )}
        </button>
        {open && !collapsed && (
          <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-200 pl-3">
            {item.children.map((c) => (
              <NavLink
                key={c.to}
                to={c.to}
                onClick={onClick}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                }
              >
                <c.icon size={15} className="flex-shrink-0" />
                <span>{c.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={onClick}
      className={({ isActive }) =>
        `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
      }
    >
      <item.icon size={18} className="flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const ROL_BADGE = {
    superadmin: 'badge-purple', admin: 'badge-blue',
    supervisor: 'badge-green', almacenero: 'badge-gray',
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200 transition-all duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${collapsed ? 'w-16' : 'w-64'}`}>

        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 min-h-[64px]">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <Warehouse size={16} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm leading-tight">ZENTRA</p>
                <p className="text-xs text-gray-500 leading-tight">Almacenes</p>
              </div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="btn-icon hidden lg:flex text-gray-500">
            <Menu size={16} />
          </button>
          <button onClick={() => setSidebarOpen(false)} className="btn-icon lg:hidden text-gray-500">
            <X size={16} />
          </button>
        </div>

        {/* Empresa */}
        {!collapsed && (
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-xs text-gray-500 truncate">{usuario?.empresa_nombre}</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV.map((item, i) => (
            <NavItem key={i} item={item} collapsed={collapsed} onClick={() => setSidebarOpen(false)} />
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {usuario?.nombre} {usuario?.apellido}
                </p>
                <span className={`text-xs ${ROL_BADGE[usuario?.rol] || 'badge-gray'}`}>
                  {usuario?.rol}
                </span>
              </div>
              <button onClick={handleLogout} className="btn-icon text-gray-400 hover:text-red-500" title="Cerrar sesión">
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="btn-icon w-full flex justify-center text-gray-400 hover:text-red-500">
              <LogOut size={15} />
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <button className="btn-icon lg:hidden text-gray-600" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-2">
            <button className="btn-icon text-gray-500 relative">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
