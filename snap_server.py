import http.server, cgi, os, sys
PORT = 8234
SAVE = '/workspace'
class H(http.server.BaseHTTPRequestHandler):
  def do_POST(self):
    ctype = self.headers.get('Content-Type','')
    if 'multipart/form-data' in ctype:
      form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD':'POST','CONTENT_TYPE':ctype})
      f = form['file']
      path = os.path.join(SAVE, f.filename or 'snap.png')
      with open(path,'wb') as out: out.write(f.file.read())
      self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    else:
      ln = int(self.headers.get('Content-Length',0))
      data = self.rfile.read(ln)
      name = self.path.strip('/') or 'snap.png'
      path = os.path.join(SAVE, name)
      with open(path,'wb') as out: out.write(data)
      self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
  def log_message(self,*a): pass
print(f'snap server on {PORT}', flush=True)
http.server.HTTPServer(('0.0.0.0',PORT), H).serve_forever()
