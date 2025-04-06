'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface FeatureCardProps {
  title: string;
  description: string;
  icon: string;
  index: number;
}

const FeatureCard = ({ title, description, icon, index }: FeatureCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl shadow-xl"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.5 }}
      whileHover={{ 
        scale: 1.03,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        background: "linear-gradient(to bottom right, #2d1d4e, #1f1635)"
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2 text-white">{title}</h3>
      <p className="text-gray-400">{description}</p>
      
      <motion.div 
        className="h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mt-4"
        initial={{ width: "0%" }}
        animate={{ width: isHovered ? "100%" : "30%" }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
};

export default function Features() {
  const features = [
    {
      title: "Modern Design",
      description: "Clean, minimalist design with attention to detail and user experience.",
      icon: "✨"
    },
    {
      title: "Interactive Elements",
      description: "Engaging animations and interactive components that respond to user actions.",
      icon: "🔥"
    },
    {
      title: "3D Visualization",
      description: "Impressive Three.js powered 3D elements that bring your content to life.",
      icon: "🌐"
    },
    {
      title: "Performance Optimized",
      description: "Built with performance in mind to ensure smooth experience across all devices.",
      icon: "⚡"
    },
    {
      title: "Fully Responsive",
      description: "Looks great on everything from mobile phones to large desktop displays.",
      icon: "📱"
    },
    {
      title: "Customizable",
      description: "Easily customizable to showcase your personal brand or company identity.",
      icon: "🎨"
    }
  ];

  return (
    <section className="py-20 px-4 md:px-10">
      <motion.div 
        className="text-center mb-16"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-pink-500">
          Impressive Features
        </h2>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Built with the latest technologies to create an engaging and memorable experience.
        </p>
      </motion.div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {features.map((feature, index) => (
          <FeatureCard 
            key={index}
            index={index}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
          />
        ))}
      </div>
    </section>
  );
}