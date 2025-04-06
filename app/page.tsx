import Image from "next/image";
import Hero from './components/Hero';
import Features from './components/Features';
import Contact from './components/Contact';
import Game from './game/components/Game';

export default function Home() {
  return (
    <div className="w-full h-screen">
      <Game />
    </div>
  );
}
