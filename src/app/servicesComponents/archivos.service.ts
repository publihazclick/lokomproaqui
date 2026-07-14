import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { environment } from 'src/environments/environment';
import { from, Observable } from 'rxjs';

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

// Sube un video del curso "Acelerador de Ventas" al bucket PRIVADO, con progreso real (%).
// Se usa XHR directo al endpoint REST de Storage en vez de supabase-js: la version instalada
// (@supabase/storage-js 2.5.5) no expone eventos de progreso de subida, y para un video de
// varios cientos de MB el mentor necesita ver que algo esta pasando (si no, parece trabado).
// Devuelve la RUTA dentro del bucket (no getPublicUrl: un bucket privado no tiene URL publica
// util) -- esa ruta es lo unico que se guarda en acelerador_lessons.video_path, y solo se puede
// volver a leer via la Edge Function acelerador-signed-url.
// El limite real de archivo del proyecto es 500MB (subido desde los 50MB originales, que
// rechazaban cualquier video de leccion real) -- si igual falla por tamano, Supabase devuelve
// "The object exceeded the maximum allowed size", que se propaga tal cual en vez de un error
// generico.
function uploadPrivateVideoConProgreso(file: File): Observable<{ progress: number; success?: boolean; path?: string; message?: string }> {
  return new Observable(observer => {
    (async () => {
      const ext = (file.name || 'mp4').split('.').pop();
      const path = `lecciones/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : environment.supabaseAnonKey;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${environment.supabaseUrl}/storage/v1/object/${PRIVATE_VIDEO_BUCKET}/${path}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', environment.supabaseAnonKey);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) observer.next({ progress: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          observer.next({ progress: 100, success: true, path });
        } else {
          let message = 'Error subiendo el video. Intenta de nuevo.';
          try { message = JSON.parse(xhr.responseText).message || message; } catch (e) { /* respuesta no era JSON */ }
          observer.next({ progress: 0, success: false, message });
        }
        observer.complete();
      };
      xhr.onerror = () => {
        observer.next({ progress: 0, success: false, message: 'Se perdio la conexion a internet. Revisa tu wifi/datos e intenta de nuevo.' });
        observer.complete();
      };
      xhr.send(file);
    })();
  });
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

  createPrivateVideoConProgreso(file: File) {
    return uploadPrivateVideoConProgreso(file);
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
