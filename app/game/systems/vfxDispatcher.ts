import { Socket } from 'socket.io-client';
import { ProjSpawn, ProjHit, ProjEnd, InstantHit } from '../../../shared/messages';

type Msg = ProjSpawn|ProjHit|ProjEnd|InstantHit;

export function hookVfx(socket:Socket){
  const emit = (name:string, detail:any) =>
    window.dispatchEvent(new CustomEvent(name.toLowerCase(), {detail}));

  socket.on('msg',(m:Msg)=>{
    switch(m.type){
      case 'ProjSpawn':  emit('projspawn', m); break;
      case 'ProjHit':    emit('projhit', m); break;
      case 'ProjEnd':    emit('projend', m); break;
      case 'InstantHit': emit('instanthit', m); break;
    }
  });
}
