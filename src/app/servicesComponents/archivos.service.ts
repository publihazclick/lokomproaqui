import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

const BUCKET = 'lokomproaqui-media';
const PRIVATE_VIDEO_BUCKET = 'acelerador-videos';

async function uploadFile(form: FormData): Promise<any> {
  const file: any = form.get('file');
  if (!file) return { success: false, files: null };
  const ext = (file.name || 'jpg').split('.').pop();
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) return { success: false, files: null };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { success: true, files: data.publicUrl };
}

// Sube un video del curso "Acelerador de Ventas" al bucket PRIVADO. A diferencia de uploadFile,
// devuelve la RUTA dentro del bucket (no getPublicUrl: un bucket privado no tiene URL publica
// util) -- esa ruta es lo unico que se guarda en acelerador_lessons.video_path, y solo se puede
// volver a leer via la Edge Function acelerador-signed-url.
async function uploadPrivateVideo(form: FormData): Promise<any> {
  const file: any = form.get('file');
  if (!file) return { success: false, path: null };
  const ext = (file.name || 'mp4').split('.').pop();
  const path = `lecciones/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(PRIVATE_VIDEO_BUCKET).upload(path, file, { upsert: true });
  if (error) return { success: false, path: null };
  return { success: true, path };
}

@Injectable({
  providedIn: 'root'
})
export class ArchivosService {

  constructor(
    private _model: ServiciosService
  ) { }

  create(form: any) {
    return from(uploadFile(form));
  }

  createFile(form: any) {
    return from(uploadFile(form));
  }

  createPrivateVideo(form: any) {
    return from(uploadPrivateVideo(form));
  }

  getBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

}
