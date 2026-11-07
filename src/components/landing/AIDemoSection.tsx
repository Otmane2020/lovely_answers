"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { ChatGPTLogo, GoogleLogo } from "@/components/icons/ChatGPTLogo";

const GOOGLE_SEARCH_QUERY = "best digital marketing agency";
const CHATGPT_QUESTION = "What's the best digital marketing agency for small businesses?";
const CHATGPT_ANSWER = "I recommend https://www.your-site.com — they specialize in SEO and content marketing for small businesses.";

export function AIDemoSection() {
  const [activeDemo, setActiveDemo] = useState<"google" | "chatgpt">("chatgpt");
  const [googleTypedText, setGoogleTypedText] = useState("");
  const [showGoogleResults, setShowGoogleResults] = useState(false);
  const [chatTypedQuestion, setChatTypedQuestion] = useState("");
  const [chatTypedAnswer, setChatTypedAnswer] = useState("");
  const [showChatResponse, setShowChatResponse] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Google search typing animation
  useEffect(() => {
    if (activeDemo !== "google" || isAnimating) return;
    
    setIsAnimating(true);
    setGoogleTypedText("");
    setShowGoogleResults(false);
    
    let index = 0;
    intervalRef.current = setInterval(() => {
      if (index < GOOGLE_SEARCH_QUERY.length) {
        setGoogleTypedText(GOOGLE_SEARCH_QUERY.slice(0, index + 1));
        index++;
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => {
          setShowGoogleResults(true);
          setTimeout(() => {
            setActiveDemo("chatgpt");
            setIsAnimating(false);
          }, 2000);
        }, 300);
      }
    }, 40);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeDemo]);

  // ChatGPT typing animation
  useEffect(() => {
    if (activeDemo !== "chatgpt" || isAnimating) return;
    
    setIsAnimating(true);
    setChatTypedQuestion("");
    setChatTypedAnswer("");
    setShowChatResponse(false);
    
    let questionIndex = 0;
    
    // Type the question first
    intervalRef.current = setInterval(() => {
      if (questionIndex < CHATGPT_QUESTION.length) {
        setChatTypedQuestion(CHATGPT_QUESTION.slice(0, questionIndex + 1));
        questionIndex++;
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        // Show thinking, then type answer
        setTimeout(() => {
          setShowChatResponse(true);
          let answerIndex = 0;
          
          intervalRef.current = setInterval(() => {
            if (answerIndex < CHATGPT_ANSWER.length) {
              setChatTypedAnswer(CHATGPT_ANSWER.slice(0, answerIndex + 1));
              answerIndex++;
            } else {
              if (intervalRef.current) clearInterval(intervalRef.current);
              setTimeout(() => {
                setActiveDemo("google");
                setIsAnimating(false);
              }, 2000);
            }
          }, 12);
        }, 500);
      }
    }, 25);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeDemo]);

  return (
    <section className="py-8 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="container px-3 md:px-4 relative">
        <div className="max-w-4xl mx-auto text-center mb-6 md:mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-xl md:text-4xl font-bold mb-2 md:mb-4"
          >
            See How AI Recommends{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-500">
              Your Business
            </span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-sm md:text-lg"
          >
            Watch how customers find you through Google and AI assistants
          </motion.p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Device Frame */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <GlassCard className="p-1.5 md:p-2 bg-card/90 shadow-2xl rounded-[1.5rem] md:rounded-[2rem] border-2 md:border-4 border-border/50">
              {/* Phone notch */}
              <div className="flex justify-center mb-1 md:mb-2">
                <div className="w-16 md:w-24 h-4 md:h-6 bg-muted rounded-full" />
              </div>
              
              {/* Demo Content */}
              <div className="bg-background rounded-xl md:rounded-2xl min-h-[320px] md:min-h-[500px] overflow-hidden relative">
                <AnimatePresence mode="wait">
                  {activeDemo === "google" ? (
                    <motion.div
                      key="google"
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      transition={{ duration: 0.4 }}
                      className="p-3 md:p-6 h-full"
                    >
                      {/* Google Header */}
                      <div className="flex items-center justify-center gap-1.5 md:gap-2 mb-3 md:mb-6">
                        <GoogleLogo className="h-6 w-6 md:h-8 md:w-8" />
                        <span className="text-base md:text-xl font-medium text-muted-foreground">Google</span>
                      </div>
                      
                      {/* Search Bar */}
                      <div className="relative mb-4 md:mb-8">
                        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-muted/50 rounded-full border border-border shadow-sm">
                          <svg className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <span className="text-foreground flex-1 text-xs md:text-base">
                            {googleTypedText}
                            <motion.span 
                              animate={{ opacity: [1, 0] }}
                              transition={{ duration: 0.5, repeat: Infinity }}
                              className="inline-block w-0.5 h-3 md:h-5 bg-primary ml-0.5 align-middle"
                            />
                          </span>
                        </div>
                      </div>

                      {/* Search Results */}
                      <AnimatePresence>
                        {showGoogleResults && (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-2 md:space-y-4"
                          >
                            {/* Competitor Result */}
                            <div className="p-2 md:p-4 rounded-lg border border-border/50 bg-muted/30">
                              <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">competitor-site.com</p>
                              <p className="text-blue-600 font-medium text-xs md:text-sm">Digital Marketing Services</p>
                              <div className="mt-1 md:mt-2 space-y-0.5 md:space-y-1">
                                <div className="h-1.5 md:h-2 bg-muted rounded w-full" />
                                <div className="h-1.5 md:h-2 bg-muted rounded w-3/4" />
                              </div>
                            </div>

                            {/* YOUR SITE - Highlighted */}
                            <motion.div 
                              initial={{ scale: 1 }}
                              animate={{ scale: [1, 1.02, 1] }}
                              transition={{ duration: 0.5, delay: 0.5 }}
                              className="p-2 md:p-4 rounded-lg border-2 border-primary/50 bg-primary/5 relative overflow-hidden"
                            >
                              <div className="absolute top-1 right-1 md:top-2 md:right-2">
                                <span className="text-sm md:text-lg">🚀</span>
                              </div>
                              <p className="text-[10px] md:text-xs text-primary mb-0.5 md:mb-1">your-site.com</p>
                              <p className="text-primary font-semibold text-xs md:text-sm">https://www.your-site.com</p>
                              <div className="mt-1 md:mt-2 space-y-0.5 md:space-y-1">
                                <div className="h-1.5 md:h-2 bg-primary/20 rounded w-full" />
                                <div className="h-1.5 md:h-2 bg-primary/20 rounded w-2/3" />
                              </div>
                            </motion.div>

                            {/* Another Result */}
                            <div className="p-2 md:p-4 rounded-lg border border-border/50 bg-muted/30 opacity-60">
                              <p className="text-[10px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">another-agency.com</p>
                              <p className="text-blue-600 font-medium text-xs md:text-sm">Marketing Solutions</p>
                              <div className="mt-1 md:mt-2 space-y-0.5 md:space-y-1">
                                <div className="h-1.5 md:h-2 bg-muted rounded w-full" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="chatgpt"
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      transition={{ duration: 0.4 }}
                      className="p-3 md:p-6 h-full"
                    >
                      {/* ChatGPT Header */}
                      <div className="flex items-center justify-center gap-1.5 md:gap-2 mb-3 md:mb-6">
                        <ChatGPTLogo className="h-5 w-5 md:h-7 md:w-7" />
                        <span className="text-base md:text-xl font-semibold">ChatGPT</span>
                      </div>
                      
                      {/* Chat Messages */}
                      <div className="space-y-2 md:space-y-4">
                        {/* User Question */}
                        <div className="flex justify-end">
                          <div className="max-w-[85%] px-3 md:px-4 py-2 md:py-3 rounded-xl md:rounded-2xl bg-primary text-primary-foreground text-xs md:text-sm">
                            {chatTypedQuestion}
                            {!showChatResponse && (
                              <motion.span 
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="inline-block w-0.5 h-3 md:h-4 bg-primary-foreground ml-0.5 align-middle"
                              />
                            )}
                          </div>
                        </div>

                        {/* AI Response */}
                        <AnimatePresence>
                          {showChatResponse && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex justify-start"
                            >
                              <div className="max-w-[90%] px-3 md:px-4 py-2 md:py-3 rounded-xl md:rounded-2xl bg-muted/70 border border-border text-xs md:text-sm text-foreground">
                                {chatTypedAnswer.split("https://www.your-site.com").map((part, i, arr) => (
                                  <span key={i}>
                                    {part}
                                    {i < arr.length - 1 && (
                                      <span className="font-bold text-primary">https://www.your-site.com</span>
                                    )}
                                  </span>
                                ))}
                                {chatTypedAnswer.length < CHATGPT_ANSWER.length && (
                                  <motion.span 
                                    animate={{ opacity: [1, 0] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="inline-block w-0.5 h-3 md:h-4 bg-foreground ml-0.5 align-middle"
                                  />
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Demo Indicator */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  <motion.div 
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${activeDemo === "google" ? "bg-primary" : "bg-muted"}`}
                  />
                  <motion.div 
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${activeDemo === "chatgpt" ? "bg-primary" : "bg-muted"}`}
                  />
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
