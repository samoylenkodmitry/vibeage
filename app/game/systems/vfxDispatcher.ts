import { Socket } from 'socket.io-client';
import { ProjSpawn, ProjHit, ProjEnd, InstantHit } from '../../../shared/messages';

type Msg = ProjSpawn|ProjHit|ProjEnd|InstantHit;

export function hookVfx(socket:Socket){
  socket.on('msg',(m:Msg)=>{
    switch(m.type){
      case 'ProjSpawn':  window.dispatchEvent(new CustomEvent('projSpawn',{detail:m}));  break;
      case 'ProjHit':    window.dispatchEvent(new CustomEvent('projHit',  {detail:m}));  break;
      case 'ProjEnd':    window.dispatchEvent(new CustomEvent('projEnd',  {detail:m}));  break;
      case 'InstantHit': window.dispatchEvent(new CustomEvent('instantHit',{detail:m})); break;
    }
  });
}
