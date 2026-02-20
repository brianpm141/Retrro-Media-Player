use std::collections::VecDeque;

#[derive(Debug)]
pub struct PriorityStack {
    stack: VecDeque<String>,
}

impl PriorityStack {
    pub fn new() -> Self {
        Self {
            stack: VecDeque::new(),
        }
    }

    pub fn push(&mut self, app: String) {
        if let Some(pos) = self.stack.iter().position(|x| *x == app) {
            self.stack.remove(pos);
        }
        self.stack.push_front(app);
    }

    pub fn current(&self) -> Option<&String> {
        self.stack.front()
    }
}
