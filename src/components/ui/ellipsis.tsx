import { useEffect, useState } from "react";

export function Ellipsis() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span aria-hidden="true">{"." .repeat(count)}</span>;
}
