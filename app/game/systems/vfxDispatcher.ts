import { Socket } from 'socket.io-client';
import { InstantHit } from '../../../shared/messages';

type Msg = InstantHit;

export function hookVfx(socket:Socket){
  const emit = (name:string, detail:any) =>
    window.dispatchEvent(new CustomEvent(name.toLowerCase(), {detail}));

  socket.on('msg',(m:Msg)=>{
    switch(m.type){
      case 'InstantHit': emit('instanthit', m); break;
    }
  });
}
