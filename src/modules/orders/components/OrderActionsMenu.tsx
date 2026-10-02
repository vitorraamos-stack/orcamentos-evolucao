import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
export function OrderActionsMenu({onArchive,onDelete}:{onArchive:()=>void;onDelete:()=>void}) { return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Mais ações da OS"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onArchive}>Arquivar OS</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>Excluir definitivamente</DropdownMenuItem></DropdownMenuContent></DropdownMenu>; }
