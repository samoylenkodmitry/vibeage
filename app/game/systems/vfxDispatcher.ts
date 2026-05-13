import { InstantHit } from '../../../packages/protocol/messages';

type Msg = InstantHit;
type MessageSource = {
  on(event: 'msg', callback: (message: Msg) => void): unknown;
};

export function hookVfx(socket: MessageSource){
  const emit = (name:string, detail:any) =>
    window.dispatchEvent(new CustomEvent(name.toLowerCase(), {detail}));

  socket.on('msg',(m:Msg)=>{
    switch(m.type){
      case 'InstantHit': emit('instanthit', m); break;
    }
  });
}
