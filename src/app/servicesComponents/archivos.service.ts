import { Injectable } from '@angular/core';
import { ServiciosService } from '../services/servicios.service';
import { supabase } from '../services/supabase.client';
import { from } from 'rxjs';

const BUCKET = 'lokomproaqui-media';

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

  getBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

}
