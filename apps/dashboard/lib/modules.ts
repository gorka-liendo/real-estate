import {
  Building2,
  Calculator,
  CalendarClock,
  Globe,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

// Registro central de secciones funcionales del dashboard. Cada una es un módulo
// vendible; aparece en el sidebar SOLO si la inmobiliaria lo tiene contratado.
// Nunca se muestra "activo/inactivo" al cliente: si no lo tiene, no existe para él.
export type ModuleSection = {
  code: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export const MODULE_SECTIONS: ModuleSection[] = [
  {
    code: "clients",
    label: "Clientes",
    href: "/clientes",
    icon: Users,
    description: "Tu cartera de clientes y su seguimiento.",
  },
  {
    code: "properties",
    label: "Propiedades",
    href: "/propiedades",
    icon: Building2,
    description: "Catálogo de inmuebles y publicaciones.",
  },
  {
    code: "visits",
    label: "Agenda",
    href: "/agenda",
    icon: CalendarClock,
    description: "Visitas a inmuebles: solicitudes, confirmaciones y choques.",
  },
  {
    code: "accounting",
    label: "Contabilidad",
    href: "/contabilidad",
    icon: Calculator,
    description: "Facturas, cobros y cuentas.",
  },
  {
    code: "whatsapp_bot",
    label: "Chatbot",
    href: "/chatbot",
    icon: MessageCircle,
    description: "Atiende y cualifica clientes por WhatsApp.",
  },
  {
    code: "microsite",
    label: "Micrositio",
    href: "/micrositio",
    icon: Globe,
    description: "Tu web pública con tu marca.",
  },
];
